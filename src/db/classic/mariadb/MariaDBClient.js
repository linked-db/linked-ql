import mariadb from 'mariadb';
import { ClassicClient } from '../ClassicClient.js';

export class MariaDBClient extends ClassicClient {

    #driver;
    #adminDriver;
    #connectionParams;

    #walSlotName;
    #walSlotPersistence = 0;

    #walClient;
    #walInit = false;

    get dialect() { return 'postgres'; }
    get driver() { return this.#driver; }
    get poolMode() { return true; }
    get walSlotName() { return this.#walSlotName; }

    constructor({
        walSlotName = 'linkedql_default_slot',
        walSlotPersistence = 1, // 2 for wholly externally-managed slot
        capability = {},
        ...connectionParams
    } = {}) {
        super({ capability });
        this.#connectionParams = connectionParams;
        this.#walSlotName = walSlotName;
        this.#walSlotPersistence = walSlotPersistence;
    }

    async _connect() {
        if (this.#driver) {
            return this.#driver.getConnection();
        }
        this.#driver = mariadb.createPool(this.#connectionParams);
        this.#adminDriver = await this.#driver.getConnection();
        return this.#driver;
    }

    async _disconnect() {
        await this._teardownRealtime();
        await this.#adminDriver.release();
        await this.#driver.end();
    }

    async _query(query, { values = [] }) {
        const rows = await this.#driver.query(query, values);
        if (rows.affectedRows) return { rowCount: rows.affectedRows };
        if (rows.changedRows) return { rowCount: rows.changedRows };
        return { rows };
    }

    async _cursor(query, { values = [], batchSize = 1000 } = {}) {
        const connection = await this.#driver.getConnection();
        const queryStream = connection.queryStream(query, values, { highWaterMark: batchSize });
        const iterator = queryStream[Symbol.asyncIterator]();
        return {
            async *[Symbol.asyncIterator]() {
                for await (const row of iterator) yield row;
            },
            async close() {
                queryStream.destroy();
                connection.release();
            },
        };
    }
}
