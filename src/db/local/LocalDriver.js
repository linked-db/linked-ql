import { AbstractDriver } from '../abstracts/AbstractDriver.js';
import { SchemaSchema } from '../../lang/ddl/schema/SchemaSchema.js';
import { TableSchema } from '../../lang/ddl/index.js';
import { matchSchemaSelector, normalizeQueryArgs, normalizeSchemaSelectorArg } from '../abstracts/util.js';
import { StorageEngine } from './StorageEngine.js';
import { QueryEngine } from './QueryEngine.js';
import { Result } from '../Result.js';

export class LocalDriver extends AbstractDriver {

    #dialect;
    #enableLive;
    #storageEngine;
    #queryEngine;
    #mutationAbortLine;

    get dialect() { return this.#dialect; }
    get enableLive() { return this.#enableLive; }
    get storageEngine() { return this.#storageEngine; }

    constructor({ dialect = 'postgres', enableLive = false, ...options } = {}, storageEngine = null) {
        super();
        this.#dialect = dialect;
        this.#enableLive = !!enableLive;
        this.#storageEngine = storageEngine || new StorageEngine;
        this.#queryEngine = new QueryEngine(this.#storageEngine, { dialect, ...options });
    }

    // ---------Lifecycle

    async connect() {
        if (this.#enableLive) {
            this.#mutationAbortLine = this.#queryEngine.on('changefeed', (events) => this._fanout(events));
        }
    }

    async disconnect() {
        this.#mutationAbortLine?.();
        this.#mutationAbortLine = null;
    }

    // ---------Query

    async query(...args) {
        const [query, options] = await this._normalizeQueryArgs(...args);
        const result = await this.#queryEngine.query(query, options);
        if (Array.isArray(result) || typeof result?.[Symbol.asyncIterator] === 'function') {
            return new Result({ rows: result });
        }
        if (typeof result === 'number') {
            return new Result({ rowCount: result });
        }
        return new Result;
    }

    // ---------Schemas

    async showCreate(selector, schemaWrapped = false) {
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
                    : schemas).push(TableSchema.fromJSON(tableSchemaJson, { dialect: this.dialect }));
            }

            if (schemaWrapped) {
                schemas.push(SchemaSchema.fromJSON(schemaSchemaJson, { dialect: this.dialect }));
            }
        }

        return schemas;
    }
}