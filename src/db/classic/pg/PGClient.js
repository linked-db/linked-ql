import pg from 'pg';
import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { ClassicClient } from '../ClassicClient.js';

export class PGClient extends ClassicClient {

    #enableLive;
    #walSlot;
    #pgPublications;
    #connectionParams;

    #driver;
    #walClient;

    get dialect() { return 'postgres'; }
    get driver() { return this.#driver; }
    get enableLive() { return this.#enableLive; }
    get walSlot() { return this.#walSlot; }
    get pgPublications() { return this.#pgPublications; }

    constructor({
        enableLive = false,
        walSlot = 'linkedql_default_slot',
        pgPublications = 'linkedql_default_publication',
        ...connectionParams
    } = {}) {
        super();
        this.#enableLive = enableLive;
        this.#walSlot = walSlot;
        this.#pgPublications = [].concat(pgPublications);
        this.#connectionParams = connectionParams;

        // Setup driver
        if (0) { // TODO
            this.#driver = new pg.Pool(this.#connectionParams);
        } else {
            this.#driver = new pg.Client(this.#connectionParams);
        }

        // Pipe evnts
        this.#driver.on('error', (err) => {
            this.emit('error', new Error(`Native Client error: ${err}`));
        });

        // Setup WAL client
        if (this.#enableLive) {
            if (!this.#walSlot) throw new Error(`Unable to start realtime; options.walSlot cannot be empty.`);
            if (!this.#pgPublications.length) throw new Error(`Unable to start realtime; options.pgPublications cannot be empty.`);
            this.#walClient = new LogicalReplicationService(this.#connectionParams);

            this.#walClient.on('error', (err) => {
                this.emit('error', new Error(`WAL Client error: ${err}`));
            });

            // Handle "data" messages
            let currentXid;
            const walTransactions = new Map;
            const walRelations = new Map;;

            // Listen to changes
            this.#walClient.on('data', (lsn, msg) => {
                switch (msg.tag) {

                    case 'begin':
                        currentXid = msg.xid;
                        walTransactions.set(currentXid, []);
                        break;

                    case 'relation':
                        walRelations.set(msg.relationOid, {
                            schema: msg.schema,
                            name: msg.name,
                            keyColumns: msg.keyColumns,
                        });
                        break;

                    case 'insert':
                    case 'update':
                    case 'delete': {
                        const rel = walRelations.get(msg.relation.relationOid) || {
                            schema: msg.relation.schema,
                            name: msg.relation.name,
                            keyColumns: msg.relation.keyColumns,
                        };
                        const evt = {
                            type: msg.tag,
                            relation: rel
                        };
                        if (msg.tag === 'insert') {
                            evt.new = msg.new;
                        } else if (msg.tag === 'update') {
                            evt.key = msg.key || Object.fromEntries(rel.keyColumns.map((k) => [k, msg.old?.[k] || msg.new?.[k]]));
                            evt.new = msg.new;
                            evt.old = msg.old; // If REPLICA IDENTITY FULL
                        } else if (msg.tag === 'delete') {
                            evt.key = msg.key || Object.fromEntries(rel.keyColumns.map((k) => [k, msg.old[k]]));
                            evt.old = msg.old; // If REPLICA IDENTITY FULL
                        }
                        walTransactions.get(currentXid)?.push(evt);
                        break;
                    }

                    case 'commit': {
                        const events = walTransactions.get(currentXid);
                        if (events?.length) this._fanout(events);
                        walTransactions.delete(currentXid);
                        currentXid = null;
                        break;
                    }

                    default:
                        break; // ignore other tags like 'type'
                }
            });
        }
    }

    // ---------Lifecycle

    async connect() {
        await this.#driver.connect();
        if (!this.#walClient) return;

        const sql1 = `SELECT slot_name FROM pg_replication_slots WHERE slot_name = '${this.#walSlot}'`;
        const result1 = await this.#driver.query(sql1);
        if (!result1.rows.length) {
            const sql = `SELECT * FROM pg_create_logical_replication_slot('${this.#walSlot}', 'pgoutput')`;
            await this.#driver.query(sql);
        }
        const sql2 = `SELECT pubname FROM pg_publication WHERE pubname IN ('${this.#pgPublications.join("', '")}')`;
        const result2 = await this.#driver.query(sql2);
        await Promise.all(this.#pgPublications.map(async (pub) => {
            if (!result2.rows.find((r) => r.pubname === pub)) {
                const sql = `CREATE PUBLICATION ${pub} FOR ALL TABLES`;
                await this.#driver.query(sql);
            }
        }));

        // Subscribe...
        const walPlugin = new PgoutputPlugin({ publicationNames: this.#pgPublications, protoVersion: 2 });
        const sub = this.#walClient.subscribe(walPlugin, this.#walSlot);
        //await sub; // awaits forever
        await new Promise((r) => setTimeout(r, 5));
    }

    async disconnect() {
        const end = this.#driver.end();
        //await end; // awaits forever
        await this.#walClient?.stop();
        await new Promise((r) => setTimeout(r, 5));
    }
}
