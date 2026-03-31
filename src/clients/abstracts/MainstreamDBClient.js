import { LinkedQLClient } from './LinkedQLClient.js';
import { RealtimeClient } from '../../proc/realtime/RealtimeClient.js';
import { SchemaInference } from './SchemaInference.js';
import { WalEngine } from '../../proc/timeline/WalEngine.js';
import { SQLParser } from '../../lang/SQLParser.js';
import { registry } from '../../lang/registry.js';
import { normalizeQueryArgs } from './util.js';
import { Result } from '../Result.js';

export class MainstreamDBClient extends LinkedQLClient {

    // Standard getters: parsers, resolver, wal

    #parser;
    #wal;
    #live;

    get parser() { return this.#parser; }
    get resolver() {
        return super.resolveGetResolver(() =>
            new SchemaInference({ client: this }));
    }
    get wal() { return this.#wal; }
    get live() { return this.#live; }

    // Internal

    #realtimeClient;

    // ------------

    constructor(options) {
        super(options);

        this.#parser = new SQLParser({ dialect: this.dialect });
        this.#wal = new WalEngine({
            drainMode: 'drain',
            lifecycleHook: async (status) => {
                await this.setCapability({ realtime: !!status });
            }
        });

        this.#realtimeClient = new RealtimeClient(this);
        this.#live = {
            forget: async (id) => await this.#realtimeClient.forget(id),
        };
    }

    async disconnect() {
        await this.#wal.close({ destroy: true });
        await super.disconnect();
    }

    // ------------

    async transaction(cb) {
        if (typeof cb !== 'function') {
            throw new TypeError('transaction(cb): cb must be a function');
        }
        if (typeof this._beginTransaction !== 'function'
            || typeof this._commitTransaction !== 'function'
            || typeof this._rollbackTransaction !== 'function') {
            throw new Error('Transaction not supported by this client implementation');
        }

        const tx = await this._beginTransaction();

        try {
            const result = await cb(tx);
            await this._commitTransaction(tx);
            return result;
        } catch (e) {
            await this._rollbackTransaction(tx);
            throw e;
        }
    }

    // ------------

    async query(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);

        const resolveQuery = async (query, tx = null) => {
            const schemaInference = this.resolver;
            return await schemaInference.resolveQuery(query, { tx });
        };

        // Realtime query?
        if (options.live) {
            const resolvedQuery = await resolveQuery(query);
            return await this.#realtimeClient.query(resolvedQuery, options);
        }

        let result;

        // Execute multistatement queries in DDL/Non-DDL sequences
        const stmtGroups = !this.options.nonDDLMode && query instanceof registry.SQLScript
            ? query.delimitDDL()
            : [query];

        if (stmtGroups.length > 1) {
            await this.transaction(async (tx) => {
                for (const query of stmtGroups) {
                    result = await this._query(
                        await resolveQuery(query, tx),
                        { ...options, tx }
                    );
                }
            });
        } else {
            result = await this._query(await resolveQuery(query), options);
        }

        // The result instance
        return new Result({ rows: result.rows, rowCount: result.rowCount });
    }

    async stream(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);

        const schemaInference = this.resolver;
        const resolvedQuery = await schemaInference.resolveQuery(query, options);

        return await this._stream(resolvedQuery, options);
    }
}
