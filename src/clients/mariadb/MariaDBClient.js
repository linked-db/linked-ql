import mariadb from 'mariadb';
import { MainstreamDBClient } from '../abstracts/MainstreamDBClient.js';

export class MariaDBClient extends MainstreamDBClient {

    #driver;
    #adminDriver;
    #connectionParams;

    #walSlotName;
    #walSlotPersistence = 0;

    #walClient;
    #walInit = false;

    get driver() { return this.#driver; }
    get poolMode() { return true; }
    get walSlotName() { return this.#walSlotName; }

    constructor({
        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 1, // 2 for wholly externally-managed slot
        capability = {},
        nonDDLMode = false,
        ...connectionParams
    } = {}) {
        super({ dialect: 'mysql', capability, nonDDLMode });

        this.#connectionParams = connectionParams;
        this.#walSlotName = walSlotName;
        this.#walSlotPersistence = walSlotPersistence;
    }

    async connect() {
        if (this.#driver) {
            return this.#driver.getConnection();
        }
        
        this.#driver = mariadb.createPool(this.#connectionParams);
        this.#adminDriver = await this.#driver.getConnection();

        await super.connect();
        return this.#driver;
    }

    async disconnect() {
        await this.#adminDriver.release();
        await this.#driver.end();
        await super.disconnect();
    }

    async _beginTransaction() {
        const conn = await this.connect();
        await conn.query('BEGIN TRANSACTION');
        return { conn };
    }

    async _commitTransaction(tx) {
        await tx.conn.query('COMMIT');
    }

    async _rollbackTransaction(tx) {
        await tx.conn.query('ROLLBACK');
    }

    async _query(query, { values = [], tx = null }) {
        const rows = await (tx?.conn || this.#driver).query(query, values);
        if (rows.affectedRows) return { rowCount: rows.affectedRows };
        if (rows.changedRows) return { rowCount: rows.changedRows };
        return { rows };
    }

    async _stream(query, { values = [], batchSize = 1000 } = {}) {
        const connection = await this.#driver.getConnection();
        const queryStream = connection.queryStream(query, values, { highWaterMark: batchSize });
        return {
            async *[Symbol.asyncIterator]() {
                try {
                    for await (const row of queryStream) {
                        yield row;
                    }
                } finally {
                    if (typeof queryStream.destroy === 'function') {
                        queryStream.destroy();
                    }
                    await connection.release();
                }
            }
        };
    }
}
