import { LinkedQLClient } from './LinkedQLClient.js';
import { RealtimeClient } from '../../proc/realtime/RealtimeClient.js';
import { SchemaInference } from './SchemaInference.js';
import { SyncEngine } from '../../proc/sync/SyncEngine.js';
import { SQLParser } from '../../lang/SQLParser.js';
import { registry } from '../../lang/registry.js';
import { normalizeQueryArgs } from './util.js';
import { Result } from '../Result.js';

export class MainstreamDBClient extends LinkedQLClient {

    // Standard getters: parsers, resolver, sync

    #parser;
    #sync;

    get parser() { return this.#parser; }
    get resolver() {
        return super.resolveGetResolver(() =>
            new SchemaInference({ client: this }));
    }
    get sync() { return this.#sync; }

    // Internal
    
    #realtimeClient;

    // ------------

    constructor(options) {
        super(options);

        this.#parser = new SQLParser({ dialect: this.dialect });
        this.#sync = new SyncEngine({
            drainMode: 'drain',
            lifecycleHook: async (status) => {
                await this.setCapability({ realtime: !!status });
            }
        });

        this.#realtimeClient = new RealtimeClient(this);
    }

    async disconnect() {
        await this.#sync.close({ destroy: true });
        await super.disconnect();
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
        if (options.live && resolvedQuery.fromClause?.()) {
            return await this.#realtimeClient.query(await resolveQuery(query), options);
        }

        let result;

        // Execute multistatement queries in DDL/Non-DDL sequences
        const stmtGroups = !this.options.nonDDLMode && query instanceof registry.SQLScript
            ? query.delimitDDL()
            : [query];

        if (stmtGroups.length > 1) {
            await this._transaction(async (tx) => {
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
