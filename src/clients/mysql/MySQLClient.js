import mysql from 'mysql2/promise';
import { Abstract2SQLClient } from '../Abstract2SQLClient.js';

export class MyAbstract1SQLClient extends Abstract2SQLClient {

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

    async _cursor(query, { values = [] } = {}) {
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
