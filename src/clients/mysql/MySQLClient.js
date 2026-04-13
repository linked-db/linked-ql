import mysql from 'mysql2/promise';
import { MainstreamClient } from '../abstracts/MainstreamClient.js';

export class MySQLClient extends MainstreamClient {

    #driver;
    #adminDriver;
    #poolMode;
    #connectionParams;

    get driver() { return this.#driver; }
    get poolMode() { return this.#poolMode; }

    constructor({
        poolMode = false,
        capability = {},
        nonDDLMode = false,
        ...connectionParams
    } = {}) {
        super({ dialect: 'mysql', capability, nonDDLMode });

        this.#poolMode = poolMode;
        this.#connectionParams = {
            ...connectionParams,
            multipleStatements: true,
        };
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
            if (this.#poolMode) await conn.release();
        };

        return {
            conn,
            txid: BigInt(txid),
            async commit() { await complete('COMMIT'); },
            async rollback() { await complete('ROLLBACK'); },
        };
    }

    async _query(query, { values = [], name = null, tx = null }) {
        const [rows] = name === true
            ? await (tx?.conn || this.#driver).execute(query, values)
            : await (tx?.conn || this.#driver).query(query, values);
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
