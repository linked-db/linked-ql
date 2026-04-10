import pg from 'pg';
import PGCursor from 'pg-cursor';
import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { MainstreamDBClient } from '../abstracts/MainstreamDBClient.js';

export class PGClient extends MainstreamDBClient {

    #driver;
    #adminDriver;
    #poolMode;
    #connectionParams;

    #walSlotName;
    #walSlotPersistence = 0;
    #pgPublications;

    #walClient;
    #walInit = false;

    get driver() { return this.#driver; }
    get poolMode() { return this.#poolMode; }
    get walSlotName() { return this.#walSlotName; }
    get pgPublications() { return this.#pgPublications; }

    constructor({
        poolMode = false,
        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 0, // 2 for wholly externally-managed slot
        pgPublications = 'linkedql_default_publication',
        capability = {},
        nonDDLMode = false,
        ...connectionParams
    } = {}) {
        super({ dialect: 'postgres', capability, nonDDLMode });

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

    async connect() {
        const result = await this.#driver.connect();
        this.#adminDriver = this.#poolMode ? result : this.#driver;
        await super.connect();
        return result;
    }

    async disconnect() {
        try {
            if (this.#poolMode) {
                await this.#adminDriver.release();
            }
            await this.#driver.end();
        } catch { /* avoid hang */ }
        await super.disconnect();
    }

    async _beginTransaction() {
        let conn;
        if (this.#poolMode) {
            conn = await this.#driver.connect();
        } else {
            if (!this.#adminDriver) {
                await this.connect();
            }
            conn = this.#driver;
        }
        await conn.query('BEGIN');
        return { conn };
    }

    async _commitTransaction(tx) {
        try {
            await tx.conn.query('COMMIT');
        } finally {
            if (this.#poolMode) {
                await tx.conn.release();
            }
        }
    }

    async _rollbackTransaction(tx) {
        try {
            await tx.conn.query('ROLLBACK');
        } finally {
            if (this.#poolMode) {
                await tx.conn.release();
            }
        }
    }

    async _query(query, { values = [], prepared = null, tx = null }) {
        return await (tx?.conn || this.#driver).query({
            text: query + '',
            values,
            name: prepared,
        });
    }

    async _stream(query, { values = [], batchSize = 1000 } = {}) {
        const pgPGCursor = this.#driver.query(new PGCursor(query + '', values));
        return {
            async *[Symbol.asyncIterator]() {
                try {
                    while (true) {
                        const rows = await pgPGCursor.read(batchSize);
                        if (!rows.length) break;
                        yield* rows;
                    }
                } finally {
                    await pgPGCursor.close();
                }
            }
        };
    }

    async _setupRealtime() {
        if (this.#walInit) return;
        this.#walInit = true;

        // Initialize replication connection
        this.#walClient = new LogicalReplicationService(this.#connectionParams);
        this.#walClient.on('error', (err) => {
            this.emit('error', new Error(`WAL Client error: ${err}`));
        });

        if (!this.#walSlotName)
            throw new Error(`Realtime requires a valid walSlotName name.`);
        if (!this.#pgPublications.length)
            throw new Error(`Realtime requires at least one publication.`);

        // Ensure slot exists
        const checkSlotSql = `SELECT * FROM pg_replication_slots WHERE slot_name = '${this.#walSlotName}'`;
        const slotCheck = await this.#adminDriver.query(checkSlotSql);

        let confirmed_flush_lsn;
        if (!slotCheck.rows.length) {
            const createSlotSQL = this.#walSlotPersistence === 0  // 0 for temporary slot
                ? `SELECT * FROM pg_create_logical_replication_slot('${this.#walSlotName}', 'pgoutput', true)`
                : `SELECT * FROM pg_create_logical_replication_slot('${this.#walSlotName}', 'pgoutput')`;
            // IMPORTANT: use the same client to avoid session issues
            const [walClientClient] = await this.#walClient.client();
            await walClientClient.query(createSlotSQL);
            // Poor patching - session needs to be persistent
            this.#walClient.client = async () => [walClientClient, walClientClient.connection];
        } else if (this.#walSlotPersistence) { // advance slot
            ({ rows: [{ confirmed_flush_lsn }] } = await this.#adminDriver.query(`SELECT confirmed_flush_lsn FROM pg_replication_slots WHERE slot_name = '${this.#walSlotName}'`));
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

        // Subscribe to WAL
        const walPlugin = new PgoutputPlugin({
            publicationNames: this.#pgPublications,
            protoVersion: 2,
        });
        // DON'T AWAIT
        this.#walClient.subscribe(walPlugin, this.#walSlotName, confirmed_flush_lsn);

        // Message handling
        const walCommits = new Map;
        const xidTrail = [];

        // Listen to changes
        this.#walClient.on('data', async (lsn, msg) => {
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
                    if (commit) await this.wal.dispatch(commit);
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
        } catch (e) {
            this.emit('warn', new Error(`Failed to stop WAL client: ${e.message}`));
        }
        this.#walClient = null;
        this.#walInit = false;
    }
}

const POSTGRES_EPOCH_OFFSET_MS = 946684800 * 1000;

function pgTimestampToNowLike(pgTimestamp) {
  if (typeof pgTimestamp === 'bigint') {
    return Number(pgTimestamp / 1000n) + POSTGRES_EPOCH_OFFSET_MS;
  }
  return pgTimestamp / 1000 + POSTGRES_EPOCH_OFFSET_MS;
}