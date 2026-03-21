import mysql from 'mysql2/promise';
import { MainstreamDBClient } from '../MainstreamDBClient.js';

export class MySQLClient extends MainstreamDBClient {

    #driver;
    #adminDriver;
    #poolMode;
    #connectionParams;

    #walSlotName;
    #walSlotPersistence = 0;

    #walClient;
    #walInit = false;

    get driver() { return this.#driver; }
    get poolMode() { return this.#poolMode; }
    get walSlotName() { return this.#walSlotName; }

    constructor({
        poolMode = false,
        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 1, // 2 for wholly externally-managed slot
        capability = {},
        nonDDLMode = false,
        ...connectionParams
    } = {}) {
        super({ dialect: 'mysql', capability, nonDDLMode });

        this.#poolMode = poolMode;
        this.#connectionParams = connectionParams;
        this.#walSlotName = walSlotName;
        this.#walSlotPersistence = walSlotPersistence;
    }

    async connect() {
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

        await super.connect();

        return this.#driver;
    }

    async disconnect() {
        if (this.#poolMode) await this.#adminDriver.release();
        await this.#driver.end();
        await super.disconnect();
    }

    async _transaction(cb) {
        const driver = await this.connect();
        await driver.query('BEGIN TRANSACTION');
        try {
            const result = await cb({ driver });
            await driver.query('COMMIT');
            return result;
        } catch (e) {
            await driver.query('ROLLBACK');
            throw e;
        }
    }

    async _query(query, { values = [], name = null, tx = null }) {
        const [rows] = name === true
            ? await (tx?.drive || this.#driver).execute(query, values)
            : await (tx?.drive || this.#driver).query(query, values);
        if (rows.affectedRows) return { rowCount: rows.affectedRows };
        if (rows.changedRows) return { rowCount: rows.changedRows };
        return { rows };
    }

    async _stream(query, { values = [] } = {}) {
        const connection = await this.#driver.getConnection();
        const queryStream = connection.queryStream(query, values);
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
