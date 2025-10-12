import pg from 'pg';
import Cursor from 'pg-cursor';
import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { ClassicClient } from '../ClassicClient.js';

export class PGClient extends ClassicClient {

    #driver;
    #adminDriver;
    #poolMode;
    #connectionParams;

    #walSlotName;
    #walSlotPersistence = 0;
    #pgPublications;

    #walClient;
    #walInit = false;

    get dialect() { return 'postgres'; }
    get driver() { return this.#driver; }
    get poolMode() { return this.#poolMode; }
    get walSlotName() { return this.#walSlotName; }
    get pgPublications() { return this.#pgPublications; }

    constructor({
        poolMode = false,
        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 1, // 2 for wholly externally-managed slot
        pgPublications = 'linkedql_default_publication',
        capability = {},
        ...connectionParams
    } = {}) {
        super({ capability });

        this.#poolMode = poolMode;
        this.#connectionParams = connectionParams;
        this.#walSlotName = walSlotName;
        this.#walSlotPersistence = walSlotPersistence;
        this.#pgPublications = [].concat(pgPublications);

        this.#driver = this.#poolMode
            ? new pg.Pool(this.#connectionParams)
            : new pg.Client(this.#connectionParams);

        this.#driver.on('error', (err) => {
            this.emit('error', new Error(`Native Client error: ${err}`));
        });
    }

    async _connect() {
        const result = await this.#driver.connect();
        this.#adminDriver = this.#poolMode
            ? result // First available client
            : this.#driver;
        return result;
    }

    async _disconnect() {
        await this._teardownRealtime();
        try {
            if (this.#poolMode) await this.#adminDriver.release();
            await this.#driver.end();
        } catch { /* avoid hang */ }
    }

    async _query(query, { values = [], name = null }) {
        return await this.#driver.query({
            text: query + '',
            values,
            name,
        });
    }

    async _cursor(query, { values = [], batchSize = 1000 } = {}) {
        const pgCursor = this.#driver.query(new Cursor(query + '', values));
        let closed = false;
        const iterator = {
            async *[Symbol.asyncIterator]() {
                while (!closed) {
                    const rows = await pgCursor.read(batchSize);
                    if (!rows.length) break;
                    yield* rows;
                }
            },
            async close() {
                if (!closed) {
                    closed = true;
                    await pgCursor.close();
                }
            },
        };
        return iterator;
    }

    async _setupRealtime() {
        if (this.#walInit) return;
        this.#walInit = true;

        if (!this.#walSlotName)
            throw new Error(`Realtime requires a valid walSlotName name.`);
        if (!this.#pgPublications.length)
            throw new Error(`Realtime requires at least one publication.`);

        // Ensure slot exists
        const checkSlotSql = `SELECT slot_name FROM pg_replication_slots WHERE slot_name = '${this.#walSlotName}'`;
        const slotCheck = await this.#adminDriver.query(checkSlotSql);

        if (!slotCheck.rows.length) {
            const createSlotSQL = this.#walSlotPersistence === 0  // 0 for wholly externally-managed slot
                ? `SELECT * FROM pg_create_logical_replication_slot('${this.#walSlotName}', 'pgoutput', true)`
                : `SELECT * FROM pg_create_logical_replication_slot('${this.#walSlotName}', 'pgoutput')`;
            await this.#adminDriver.query(createSlotSQL);
        } else if (this.#walSlotPersistence) { // advance slot
            const { rows: [{ lsn }] } = await this.#adminDriver.query(`SELECT pg_current_wal_lsn() AS lsn`);
            await this.#adminDriver.query(`SELECT pg_replication_slot_advance('${this.#walSlotName}', '${lsn}')`);
        }

        // Ensure publication(s) exist
        const createPubSql = `SELECT pubname FROM pg_publication WHERE pubname IN ('${this.#pgPublications.join("', '")}')`;
        const pubsInDb = await this.#adminDriver.query(createPubSql);
        await Promise.all(this.#pgPublications.map(async (pub) => {
            if (!pubsInDb.rows.find((r) => r.pubname === pub)) {
                const sql = `CREATE PUBLICATION "${pub}" FOR ALL TABLES`;
                await this.#adminDriver.query(sql);
            }
        }));

        // Initialize replication connection
        this.#walClient = new LogicalReplicationService(this.#connectionParams);
        this.#walClient.on('error', (err) => {
            this.emit('error', new Error(`WAL Client error: ${err}`));
        });

        const walPlugin = new PgoutputPlugin({
            publicationNames: this.#pgPublications,
            protoVersion: 2,
        });

        const sub = this.#walClient.subscribe(walPlugin, this.#walSlotName);
        //await sub; // awaits forever

        // Message handling
        let currentXid = null;
        const walTransactions = new Map();
        const walRelations = new Map();

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
                        evt.key = msg.key
                            || Object.fromEntries(rel.keyColumns.map((k) => [k, msg.old?.[k] || msg.new?.[k]]));
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
                    // clear stale relations every 100 transactions
                    if (walRelations.size > 100) walRelations.clear();
                    break;
                }

                default: break; // ignore other tags like 'type'
            }
        });
    }

    async _teardownRealtime() {
        if (!this.#walClient) return;
        try {
            await this.#walClient.stop();
        } catch (err) { this.emit('warn', new Error(`Failed to stop WAL client: ${err.message}`)); }
        if (this.#walSlotPersistence === 1) { // 2 for wholly externally-managed slot
            try {
                const sql = `SELECT pg_drop_replication_slot('${this.#walSlotName}')`;
                await this.#adminDriver.query(sql);
            } catch (e) { this.emit('warn', new Error(`Slot cleanup skipped: ${e.message}`)); }
        }
        this.#walClient = null;
        this.#walInit = false;
    }
}
