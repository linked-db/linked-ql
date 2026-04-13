import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { MainstreamWal } from '../abstracts/MainstreamWal.js';

export class PGWal extends MainstreamWal {

    #pgClient;
    #conn;
    #connectionParams;

    #walSlotName;
    #walSlotPersistence = 0;
    #pgPublications;

    #walService;

    get walSlotName() { return this.#walSlotName; }
    get pgPublications() { return this.#pgPublications; }

    constructor({
        pgClient,

        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 0, // 2 for wholly externally-managed slot
        pgPublications = 'linkedql_default_publication',

        ...connectionParams
    } = {}) {
        super({ mainstreamClient: pgClient });
        this.#pgClient = pgClient;

        this.#walSlotName = walSlotName;
        this.#walSlotPersistence = walSlotPersistence;
        this.#pgPublications = [].concat(pgPublications);

        this.#connectionParams = connectionParams;
    }

    async _setupRealtime() {
        if (this.#conn) return;
        this.#conn = await this.#pgClient.connect();

        // Initialize replication connection
        this.#walService = new LogicalReplicationService(this.#connectionParams);
        this.#walService.on('error', (err) => {
            this.#pgClient.emit('error', new Error(`WAL Client error: ${err}`));
        });

        if (!this.#walSlotName)
            throw new Error(`Realtime requires a valid walSlotName name.`);
        if (!this.#pgPublications.length)
            throw new Error(`Realtime requires at least one publication.`);

        // Ensure slot exists
        const checkSlotSql = `SELECT * FROM pg_replication_slots WHERE slot_name = '${this.#walSlotName}'`;
        const slotCheck = await this.#conn.query(checkSlotSql);

        let confirmed_flush_lsn;
        if (!slotCheck.rows.length) {
            const createSlotSQL = this.#walSlotPersistence === 0  // 0 for temporary slot
                ? `SELECT * FROM pg_create_logical_replication_slot('${this.#walSlotName}', 'pgoutput', true)`
                : `SELECT * FROM pg_create_logical_replication_slot('${this.#walSlotName}', 'pgoutput')`;
            // IMPORTANT: use the same client to avoid session issues
            const [walClientClient] = await this.#walService.client();
            await walClientClient.query(createSlotSQL);
            // Poor patching - session needs to be persistent
            this.#walService.client = async () => [walClientClient, walClientClient.connection];
        } else if (this.#walSlotPersistence) { // advance slot
            ({ rows: [{ confirmed_flush_lsn }] } = await this.#conn.query(`SELECT confirmed_flush_lsn FROM pg_replication_slots WHERE slot_name = '${this.#walSlotName}'`));
        }

        // Ensure publication(s) exist
        const createPubSql = `SELECT pubname FROM pg_publication WHERE pubname IN ('${this.#pgPublications.join("', '")}')`;
        const pubsInDb = await this.#conn.query(createPubSql);
        await Promise.all(this.#pgPublications.map(async (pub) => {
            if (!pubsInDb.rows.find((r) => r.pubname === pub)) {
                const sql = `CREATE PUBLICATION "${pub}" FOR ALL TABLES`;
                await this.#conn.query(sql);
            }
        }));

        // Subscribe to WAL
        const walPlugin = new PgoutputPlugin({
            publicationNames: this.#pgPublications,
            protoVersion: 2,
        });
        // DON'T AWAIT
        this.#walService.subscribe(walPlugin, this.#walSlotName, confirmed_flush_lsn);

        // Message handling
        const walCommits = new Map;
        const xidTrail = [];

        // Listen to changes
        this.#walService.on('data', async (lsn, msg) => {
            switch (msg.tag) {

                case 'begin':
                    walCommits.set(msg.xid, {
                        txId: msg.xid,
                        commitTime: pgTimestampToNowLike(msg.commitTime),
                        entries: [],
                    });
                    xidTrail.unshift(msg.xid);
                    break;

                case 'insert':
                case 'update':
                case 'delete': {
                    const rel = {
                        namespace: msg.relation.schema,
                        name: msg.relation.name,
                        keyColumns: msg.relation.keyColumns,
                    };
                    const entry = {
                        op: msg.tag,
                        relation: rel
                    };
                    if (msg.tag === 'insert') {
                        entry.new = msg.new;
                    } else if (msg.tag === 'update') {
                        entry.new = msg.new;
                        if (msg.old) {
                            // If REPLICA IDENTITY FULL
                            entry.old = msg.old;
                        } else {
                            // If REPLICA IDENTITY DEFAULT
                            entry.key = msg.key || Object.fromEntries(msg.relation.keyColumns.map((k) => [k, msg.new[k]]));
                        }
                    } else if (msg.tag === 'delete') {
                        if (msg.old) {
                            // If REPLICA IDENTITY FULL
                            entry.old = msg.old;
                        } else {
                            // If REPLICA IDENTITY DEFAULT
                            entry.key = msg.key;
                        }
                    }
                    walCommits.get(xidTrail[0])?.entries.push(entry);
                    break;
                }

                case 'commit': {
                    const xid = xidTrail.shift();
                    const commit = walCommits.get(xid);
                    walCommits.delete(xid);
                    if (commit) await this.dispatch(commit);
                    break;
                }

                default: break; // ignore other tags like 'type'
            }
        });
    }

    async _teardownRealtime() {
        if (!this.#walService) return;
        try {
            await this.#walService.stop();
        } catch (e) {
            this.#pgClient.emit('warn', new Error(`Failed to stop WAL client: ${e.message}`));
        }
        this.#walService = null;
        await this.#conn.disconnect();
        this.#conn = null;
    }
}

const POSTGRES_EPOCH_OFFSET_MS = 946684800 * 1000;

function pgTimestampToNowLike(pgTimestamp) {
  if (typeof pgTimestamp === 'bigint') {
    return Number(pgTimestamp / 1000n) + POSTGRES_EPOCH_OFFSET_MS;
  }
  return pgTimestamp / 1000 + POSTGRES_EPOCH_OFFSET_MS;
}