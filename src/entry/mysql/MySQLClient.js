import mysql from 'mysql2/promise';
import { AbstractSQL0Client } from '../AbstractSQL0Client.js';

export class MyAbstractSQLClient extends AbstractSQL0Client {

    #driver;
    #adminDriver;
    #poolMode;
    #connectionParams;

    #walSlotName;
    #walSlotPersistence = 0;

    #walClient;
    #walInit = false;

    get dialect() { return 'postgres'; }
    get driver() { return this.#driver; }
    get poolMode() { return this.#poolMode; }
    get walSlotName() { return this.#walSlotName; }

    constructor({
        poolMode = false,
        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 1, // 2 for wholly externally-managed slot
        capability = {},
        ...connectionParams
    } = {}) {
        super({ capability });
        this.#poolMode = poolMode;
        this.#connectionParams = connectionParams;
        this.#walSlotName = walSlotName;
        this.#walSlotPersistence = walSlotPersistence;
    }

    async _connect() {
        if (this.#driver) {
            return this.#poolMode
                ? this.#driver.getConnection()
                : this.#driver;
        }
        this.#driver = this.#poolMode
            ? mysql.createPool(this.#connectionParams)
            : await mysql.createConnection(this.#connectionParams);

        this.#adminDriver = this.#poolMode
            ? await this.#driver.getConnection()
            : this.#driver;
        return this.#driver;
    }

    async _disconnect() {
        await this._teardownRealtime();
        if (this.#poolMode) await this.#adminDriver.release();
        await this.#driver.end();
    }

    async _query(query, { values = [], name = null }) {
        const [rows] = name === true
            ? await this.#driver.execute(query, values)
            : await this.#driver.query(query, values);
        if (rows.affectedRows) return { rowCount: rows.affectedRows };
        if (rows.changedRows) return { rowCount: rows.changedRows };
        return { rows };
    }

    async _cursor(query, { values = [], batchSize = 1000 } = {}) {
        const connection = await this.#driver.getConnection();
        const queryStream = connection.queryStream(query, values);
        const reader = queryStream[Symbol.asyncIterator]();
        let closed = false;
        const iterator = {
            async *[Symbol.asyncIterator]() {
                let batch = [];
                while (!closed) {
                    const { value, done } = await reader.next();
                    if (done) break;
                    batch.push(value);
                    if (batch.length >= batchSize) {
                        yield* batch;
                        batch = [];
                    }
                }
                if (batch.length) yield* batch;
            },
            async close() {
                if (!closed) {
                    closed = true;
                    queryStream.destroy();
                    await connection.release();
                }
            },
        };
        return iterator;
    }
}
