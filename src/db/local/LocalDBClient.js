import { AbstractDBAdapter } from '../abstracts/AbstractDBAdapter.js';
import { SchemaSchema } from '../../lang/ddl/schema/SchemaSchema.js';
import { StorageEngine } from './StorageEngine.js';
import { QueryEngine } from './QueryEngine.js';
import { TableSchema } from '../../lang/ddl/index.js';

export class LocalDBClient extends AbstractDBAdapter {

    #options;

    #storageEngines = new Map;
    #queryEngines = new Map;

    get dialect() { return 'postgres'; }

    constructor(options = {}) {
        super();
        this.#options = options;
    }

    createDatabase(schemaName = 'public', storageEngine = null) {
        if (this.#storageEngines.has(schemaName)) {
            throw new Error(`Database "${schemaName}" already exists.`);
        }
        this.#storageEngines.set(schemaName, storageEngine || new StorageEngine(this.#options));
        this.#queryEngines.set(schemaName, new QueryEngine(this.#storageEngines.get(schemaName), this.#options));
        return this.#storageEngines.get(schemaName);
    }

    async query(ast, schemaName = 'public') {
        return await this.#queryEngines.get(schemaName).query(ast);
    }

    async subscribe(table, callback) {
        const abortLines = this.#storageEngines.map(([, storage]) => {
            storage.on(table, (event) => callback([event]));
        });
        return () => abortLines.forEach((cb) => cb());
    }

    async showCreate(selector, schemaScoped = false) {
        const schemas = [];
        for (const [dbName, storage] of this.#storageEngines.entries()) {
            const tableSelectors = Array.isArray(selector)
                ? selector.reduce((arr, s) => this._matchSelector(dbName, [s.schemaName]) ? arr.concat(s.tables || ['*']) : arr, [])
                : (this._matchSelector(dbName, selector?.schemaNames || []) ? ['*'] : []);
            if (!tableSelectors.length) continue;
            // Schema def:
            const schemaSchemaJson = {
                nodeName: 'SCHEMA_SCHEMA',
                name: { nodeName: 'SCHEMA_IDENT', value: dbName },
                entries: [],
            };
            // Schema tables:
            for (const tbl of storage.tableNames()) {
                if (!this._matchSelector(tbl, tableSelectors)) continue;
                const tableSchemaJson = storage.tableSchema(tbl).jsonfy();
                tableSchemaJson.name.qualifier = { nodeName: 'SCHEMA_REF', value: dbName };
                (schemaScoped ? schemaSchemaJson.entries : schemas).push(
                    TableSchema.fromJSON(tableSchemaJson, { dialect: this.dialect })
                );
            }
            if (schemaScoped) {
                schemas.push(SchemaSchema.fromJSON(schemaSchemaJson, { dialect: this.dialect }));
            }
        }
        return schemas;
    }
}