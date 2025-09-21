import { TableSchema } from '../../lang/ddl/index.js';
import { SchemaSchema } from '../../lang/ddl/schema/SchemaSchema.js';
import { AbstractDriver } from '../abstracts/AbstractDriver.js';
import { matchSchemaSelector, normalizeSchemaSelectorArg } from '../abstracts/util.js';
import { StorageEngine } from './StorageEngine.js';
import { QueryEngine } from './QueryEngine.js';

export class LocalDriver extends AbstractDriver {

    #options;

    #storageEngines = new Map;
    #queryEngines = new Map;

    get dialect() { return 'postgres'; }

    constructor(options = {}) {
        super();
        this.#options = options;
    }

    // ---------Schema

    async schemaNames() { return [...this.#storageEngines.keys()]; }

    async createSchema(schemaName = 'public', storageEngine = null) {
        if (this.#storageEngines.has(schemaName)) {
            throw new Error(`Schema "${schemaName}" already exists.`);
        }
        this.#storageEngines.set(schemaName, storageEngine || new StorageEngine(this.#options));
        this.#queryEngines.set(schemaName, new QueryEngine(this.#storageEngines.get(schemaName), this.#options));
        return this.#storageEngines.get(schemaName);
    }

    async dropSchema(schemaName) {
        if (!this.#storageEngines.has(schemaName)) {
            throw new Error(`Schema "${schemaName}" does not exists.`);
        }
        this.#storageEngines.delete(schemaName);
        this.#queryEngines.delete(schemaName);
    }

    async showCreate(selector, schemaWrapped = false) {
        selector = normalizeSchemaSelectorArg(selector);
        const schemas = [];
        for (const [schemaName, storage] of this.#storageEngines.entries()) {
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
            for (const tbl of await storage.tableNames()) {
                if (!matchSchemaSelector(tbl, objectNames)) continue;
                const tableSchemaJson = (await storage.tableSchema(tbl)).jsonfy();
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

    // ---------Query

    async query(ast, schemaName = 'public') {
        return await this.#queryEngines.get(schemaName).query(ast);
    }

    // ---------Subscriptions

    subscribe(selector, callback) {
        if (typeof selector === 'function') {
            callback = selector;
            selector = '*';
        }
        selector = normalizeSchemaSelectorArg(selector);
        const abortLines = [...this.#storageEngines.entries()].map(([schemaName, storage]) => {
            const tables = [].concat(selector['*'] || []).concat(selector[schemaName] || []);
            if (!tables.length) return;
            storage.on('mutation', (event) => {
                if (!tables.includes('*')
                    && !tables.includes(event.relation.name)) {
                    return;
                }
                callback([{
                    ...event,
                    relation: { ...event.relation, schema: schemaName },
                }]);
            });
        });
        return () => abortLines.forEach((cb) => cb?.());
    }
}