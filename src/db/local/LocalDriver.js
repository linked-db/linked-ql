import { AbstractStmt } from '../../lang/abstracts/AbstractStmt.js';
import { TableSchema } from '../../lang/ddl/index.js';
import { SchemaSchema } from '../../lang/ddl/schema/SchemaSchema.js';
import { AbstractDriver } from '../abstracts/AbstractDriver.js';
import { matchSchemaSelector, normalizeQueryArgs, normalizeSchemaSelectorArg } from '../abstracts/util.js';
import { StorageEngine } from './StorageEngine.js';
import { QueryEngine } from './QueryEngine.js';

export class LocalDriver extends AbstractDriver {

    #options;
    #storageEngine;
    #queryEngine;

    get dialect() { return 'postgres'; }

    constructor(options = {}) {
        super();
        this.#options = options;
    }

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

    // ---------Query

    async query(ast, schemaName = 'public') {
        const [query, options] = normalizeQueryArgs(true, ...args);
        return await this.#queryEngine.query(query);
    }

    // ---------Subscriptions

    subscribe(selector, callback) {
        if (typeof selector === 'function') {
            callback = selector;
            selector = '*';
        }
        selector = normalizeSchemaSelectorArg(selector);
        const abortLines = [...this.#storageEngine.entries()].map(([schemaName, storage]) => {
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