import { LinkedQLClient } from './LinkedQLClient.js';
import { RealtimeClient } from '../../proc/realtime/RealtimeClient.js';
import { MainstreamSchemaInference } from './MainstreamSchemaInference.js';
import { SQLParser } from '../../lang/SQLParser.js';
import { SYSTEM_TAG } from '../../proc/SYSTEM.js';
import { registry } from '../../lang/registry.js';
import { normalizeQueryArgs } from './util.js';
import { Result } from '../Result.js';

export class MainstreamClient extends LinkedQLClient {

    // Standard getters: parsers, resolver

    #parser;
    #live;

    get parser() { return this.#parser; }
    get resolver() {
        return super.resolveGetResolver(() =>
            new MainstreamSchemaInference({ mainstreamClient: this, dialect: this.dialect }));
    }
    get live() { return this.#live; }

    // Internal

    #realtimeClient;

    // ------------

    constructor(options) {
        super(options);

        this.#parser = new SQLParser({ dialect: this.dialect });

        this.#realtimeClient = new RealtimeClient(this);
        this.#live = {
            forget: async (id) => await this.#realtimeClient.forget(id),
        };
    }

    // ------------

    async begin(options = {}) {
        if (options.parentTx) {
            throw new Error(`Nested transactions are not supported on mainstream databasew for now`);
        }
        return await this._begin(options);
    }

    async transaction(cb, options = {}) {
        if (typeof cb !== 'function') {
            throw new TypeError('transaction(cb): cb must be a function');
        }
        
        const tx = await this.begin(options);

        try {
            const result = await cb(tx);
            await tx.commit();
            return result;
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    }

    // ------------

    async query(...args) {
        const [_query, { tx: inputTx, liveQueryOriginated = null, ...options }] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);
        const inLiveQueryContext = liveQueryOriginated === SYSTEM_TAG;

        const resolveQuery = async (query, tx, ifHasSugars = false) => {
            const schemaInference = this.resolver;
            return await schemaInference.resolveQuery(query, { tx, ifHasSugars });
        };

        // Realtime query?
        if (options.live) {
            const resolvedQuery = await resolveQuery(query, inputTx);
            return await this.#realtimeClient.query(resolvedQuery, { ...options, tx: inputTx });
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
                        await resolveQuery(query, tx, true),
                        { ...options, tx, inLiveQueryContext }
                    );
                }
            }, { parentTx: inputTx });
        } else {
            result = await this._query(
                await resolveQuery(query, inputTx, true),
                { ...options, tx: inputTx, inLiveQueryContext }
            );
        }

        // The result instance
        return new Result({ rows: result.rows, rowCount: result.rowCount });
    }

    async stream(...args) {
        const [_query, { tx: inputTx, ...options }] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);

        const schemaInference = this.resolver;
        const resolvedQuery = await schemaInference.resolveQuery(query, { ...options, tx: inputTx, ifHasSugars: true });

        return await this._stream(resolvedQuery, { ...options, tx: inputTx });
    }
}
