// TODO: import mariadb from 'mariadb';
import { MainstreamClient } from '../abstracts/MainstreamClient.js';

export class MariaDBClient extends MainstreamClient {

    #driver;
    #connectionParams;

    get driver() { return this.#driver; }
    get poolMode() { return true; }

    constructor({
        capability = {},
        nonDDLMode = false,
        ...connectionParams
    } = {}) {
        super({ dialect: 'mysql', capability, nonDDLMode });

        this.#connectionParams = {
            ...connectionParams,
            multipleStatements: true,
        };
    }

    async connect() {
        if (this.#driver) {
            return this.#driver.getConnection();
        }
        
        this.#driver = mariadb.createPool(this.#connectionParams);

        await super.connect();
        return this.#driver;
    }

    async disconnect() {
        await this.#driver.end();
        await super.disconnect();
    }

    async _begin(options) {
        const conn = await this.connect();

        const [results] = await conn.query(`
            BEGIN TRANSACTION;
            SET @__current_tx_uuid__ = UUID_SHORT();
            SELECT @__current_tx_uuid__ AS txid;
        `);
        // results[0] is the result of 'BEGIN'
        // results[1] is the result of 'SET'
        // results[2] is the result of 'SELECT'
        const txid = results[2][0].txid;

        const complete = async (cmd) => {
            await conn.query(cmd);
            await conn.release();
        };

        return {
            conn,
            txid: BigInt(txid),
            async commit() { await complete('COMMIT'); },
            async rollback() { await complete('ROLLBACK'); },
        };
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
