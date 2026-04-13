import pg from 'pg';
import PGCursor from 'pg-cursor';
import { MainstreamClient } from '../abstracts/MainstreamClient.js';
import { PGWal } from './PGWal.js';

export class PGClient extends MainstreamClient {

    #conn;
    #connectionParams;
    #poolMode;

    #_connectCalled = false;

    #wal;

    get conn() { return this.#conn; }
    get connectionParams() { return this.#connectionParams; }
    get poolMode() { return this.#poolMode; }

    get wal() { return this.#wal; }

    constructor({
        poolMode = false,
        nonDDLMode = false,

        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 0, // 2 for wholly externally-managed slot
        pgPublications = 'linkedql_default_publication',

        capability = {},

        ...connectionParams
    } = {}) {
        super({ dialect: 'postgres', capability, nonDDLMode });

        this.#connectionParams = connectionParams;
        this.#poolMode = poolMode;

        this.#conn = this.#poolMode
            ? new pg.Pool(this.#connectionParams)
            : new pg.Client(this.#connectionParams);

        this.#conn.on('error', (err) => {
            this.emit('error', new Error(`Native Client error: ${err}`));
        });

        this.#wal = new PGWal({
            walSlotName,
            walSlotPersistence,
            pgPublications,
            ...connectionParams,

            pgClient: this,
        });
    }

    async connect() {
        const result = this.#poolMode
            ? await this.#conn.connect()
            : this.#conn;

        if (!this.#_connectCalled) {
            if (!this.#poolMode) {
                await this.#conn.connect();
            }
            await super.connect();
        }

        this.#_connectCalled = true;
        return result;
    }

    async disconnect() {
        try {
            await this.#conn.end();
        } catch { /* avoid hang */ }
        await this.#wal.close();
        await super.disconnect();
    }

    async _begin(options) {
        const conn = await this.connect();

        const res = await conn.query(`
            BEGIN;
            SELECT pg_current_xact_id()::TEXT AS txid;`
        );
        const txid = res[1].rows[0].txid;

        const complete = async (cmd) => {
            await conn.query(cmd);
            if (this.#poolMode) await conn.release();
        };

        return {
            conn,
            id: BigInt(txid),
            async commit() { await complete('COMMIT'); },
            async rollback() { await complete('ROLLBACK'); },
        };
    }

    async _query(query, { values = [], prepared = null, tx = null }) {
        return await (tx?.conn || this.#conn).query({
            text: query + '',
            values,
            name: prepared,
        });
    }

    async _stream(query, { values = [], batchSize = 1000, tx = null } = {}) {
        const pgPGCursor = (tx?.conn || this.#conn).query(new PGCursor(query + '', values));
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
}