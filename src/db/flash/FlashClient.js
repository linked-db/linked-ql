import { AbstractClient } from '../abstracts/AbstractClient.js';
import { matchSchemaSelector, normalizeSchemaSelectorArg } from '../abstracts/util.js';
import { StorageEngine } from './StorageEngine.js';
import { QueryEngine } from './QueryEngine.js';
import { registry } from '../../lang/registry.js';

export class FlashClient extends AbstractClient {

    #dialect;

    #storageEngine;
    #queryEngine;

    #realtimeAbortLine;

    get dialect() { return this.#dialect; }
    get storageEngine() { return this.#storageEngine; }

    constructor({ dialect = 'postgres', capability = {}, ...options } = {}, storageEngine = null) {
        super({ capability });
        this.#dialect = dialect;
        this.#storageEngine = storageEngine || new StorageEngine({ dialect, ...options });
        this.#queryEngine = new QueryEngine(this.#storageEngine, { dialect, ...options });
    }

    async _connect() { }

    async _disconnect() { }

    async _query(query, options) {
        return await this.#queryEngine.query(query, options);
    }
    async _cursor(query, options) {
        let closed = false;
        return {
            async *[Symbol.asyncIterator]() {
                const { rows } = await this._query(query, options);
                for await (const row of rows) {
                    if (closed) return;
                    yield row;
                }
            },
            async close() {
                if (!closed) {
                    closed = true;
                }
            },
        };
        return await this._query(query, options);
    }

    async _setupRealtime() {
        if (this.#realtimeAbortLine) return; // Indempotency
        this.#realtimeAbortLine = this.#queryEngine.on('changefeed', (events) => this._fanout(events));
    }

    async _teardownRealtime() {
        this.#realtimeAbortLine?.();
        this.#realtimeAbortLine = null;
    }

    async _showCreate(selector, schemaWrapped = false) {
        selector = normalizeSchemaSelectorArg(selector);
        const schemas = [];
        for (const schemaName of await this.#storageEngine.schemaNames()) {
            const objectNames = Object.entries(selector).reduce((arr, [_schemaName, objectNames]) => {
                return matchSchemaSelector(schemaName, [_schemaName])
                    ? arr.concat(objectNames)
                    : arr;
            }, []);
            if (!objectNames.length) continue;

            // Schema def:
            const schemaSchemaJson = {
                nodeName: 'SCHEMA_SCHEMA',
                name: { nodeName: 'SCHEMA_IDENT', value: schemaName },
                entries: [],
            };

            // Schema tables:
            for (const tbl of await this.#storageEngine.tableNames(schemaName)) {
                if (!matchSchemaSelector(tbl, objectNames)) continue;
                const tableSchemaJson = (await this.#storageEngine.tableSchema(tbl, schemaName)).jsonfy();
                tableSchemaJson.name.qualifier = { nodeName: 'SCHEMA_REF', value: schemaName };
                (schemaWrapped
                    ? schemaSchemaJson.entries
                    : schemas).push(registry.TableSchema.fromJSON(tableSchemaJson, { dialect: this.dialect }));
            }

            if (schemaWrapped) {
                schemas.push(registry.SchemaSchema.fromJSON(schemaSchemaJson, { dialect: this.dialect }));
            }
        }

        return schemas;
    }
}