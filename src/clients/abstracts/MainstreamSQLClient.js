import { AbstractSQLClient } from './AbstractSQLClient.js';
import { RealtimeClient } from '../../proc/realtime/RealtimeClient.js';
import { SchemaInference } from './SchemaInference.js';
import { SyncEngine } from '../../proc/sync/SyncEngine.js';
import { SQLParser } from '../../lang/SQLParser.js';
import { normalizeQueryArgs } from './util.js';
import { Result } from '../Result.js';
import { registry } from '../../lang/registry.js';

export class MainstreamSQLClient extends AbstractSQLClient {

    #parser;
    #sync;
    #realtimeClient;

    get parser() { return this.#parser; }
    get sync() { return this.#sync; }
    get realtimeClient() { return this.#realtimeClient; }

    async connect() {
        if (this.#parser) return;

        this.#parser = new SQLParser({ dialect: this.dialect });
        this.#sync = new SyncEngine({
            dialect: this.dialect,
            drainMode: 'drain',
            lifecycleHook: async (status) => {
                await this.setCapability({ realtime: !!status });
            }
        });

        this.#realtimeClient = new RealtimeClient(this);
        await super.connect();
    }

    async disconnect() {
        await super.disconnect();
        await this.#sync.close({ destroy: true });
    }

    async setCapability(capMap) {
        capMap = await super.setCapability(capMap);
        // realtime?
        if (capMap.realtime === false) {
            await this._teardownRealtime();
        } else if (capMap.realtime) {
            await this._setupRealtime();
        }
        return capMap;
    }

    #lifetimeSchemaInference;

    createSchemaInference() {
        if (this.options.nonDDLMode) {
            // We've been promised no DDL operations will
            // happen while we're running
            if (!this.#lifetimeSchemaInference)
                this.#lifetimeSchemaInference = new SchemaInference({ client: this });
            return this.#lifetimeSchemaInference;
        }
        return new SchemaInference({ client: this });
    }

    async query(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);

        const resolveQuery = async (query, tx = null) => {
            const schemaInference = this.createSchemaInference();
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

        const schemaInference = this.createSchemaInference();
        const resolvedQuery = await schemaInference.resolveQuery(query, options);

        return await this._stream(resolvedQuery, options);
    }
}
