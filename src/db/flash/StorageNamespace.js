import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { TableStorage } from './TableStorage.js';
import { registry } from '../../lang/registry.js';

export class StorageNamespace extends SimpleEmitter {

    #name;
    #parentNode;
    #options;

    #mirrored;
    #materialized;
    #origin;

    #tables = new Map;

    get name() { return this.#name; }
    get parentNode() { return this.#parentNode; }
    get options() { return this.#options; }

    get mirrored() { return this.#mirrored; }
    get materialized() { return this.#materialized; }
    get origin() { return this.#origin; }

    constructor(name, parentNode, { mirrored = false, materialized = false, origin = null, ...options } = {}) {
        super();
        this.#name = name;
        this.#parentNode = parentNode;
        this.#options = options;

        this.#mirrored = mirrored;
        this.#materialized = materialized;
        this.#origin = origin;

        this.on('changefeed', (events) => this.#parentNode?.emit('changefeed', events));
    }

    get size() { return this.#tables.size; }

    async _destroy() {
        this.#parentNode = null;
    }

    async tableNames() {
        return [this.#tables.keys()];
    }

    async createTable(tableSchema, { ifNotExists = false, primaryKey = 'id', autoIncr = true, dialect = 'postgres', ...tableOptions } = {}) {
        if (typeof tableSchema === 'string') {
            tableSchema = { name: { value: tableSchema }, entries: [] };
            if (primaryKey) {
                const keyCol = {
                    nodeName: registry.ColumnSchema.NODE_NAME,
                    name: { value: primaryKey },
                    data_type: { value: 'INT' },
                    entries: [{ nodeName: registry.ColumnPkConstraint.NODE_NAME, value: 'KEY' }],
                };
                if (autoIncr) {
                    if (dialect === 'mysql') {
                        keyCol.entries.push({
                            nodeName: registry.MyColumnAutoIncrementModifier.NODE_NAME,
                            value: 'AUTO_INCREMENT',
                        });
                    } else {
                        keyCol.entries.push({
                            nodeName: registry.ColumnIdentityConstraint.NODE_NAME,
                            by_default_kw: true,
                            as_identity_kw: true,
                        });
                    }
                }
                tableSchema.entries.push(keyCol);
            }
            // Instantiate
            tableSchema = registry.TableSchema.fromJSON(tableSchema, { dialect });
        } else {
            if (!(tableSchema instanceof registry.TableSchema)) {
                throw new Error(`tableSchema must be an instance of TableSchema`);
            }
            tableSchema = tableSchema.clone();
            if (tableSchema.name().qualifier()) {
                schemaName = tableSchema.name().qualifier().value();
            }
        }

        const tableName = tableSchema.name().value();
        if (this.#tables.has(tableName)) {
            if (ifNotExists) return this.#tables.get(tableName);
            throw new Error(`Table ${tableName} already exists`);
        }

        const tableStorage = new TableStorage(tableSchema, this, tableOptions);
        this.#tables.set(tableName, tableStorage);
        return tableStorage;
    }

    async dropTable(tableName, { ifExists = false, cascade = false } = {}) {
        const tableStorage = this.#tables.get(tableName);
        if (!tableStorage) {
            if (ifExists) return null;
            throw new Error(`Table ${tableName} does not exist`);
        }

        if (tableStorage.size && !cascade) {
            throw new Error(`Table ${tableName} is not empty.`);
        }
        await tableStorage._destroy();

        this.#tables.delete(tableName);
        return tableStorage;
    }

    async getTable(tableName) {
        const tableStorage = this.#tables.get(tableName);
        if (!tableStorage) throw new Error(`Table ${tableName} does not exist`);
        return tableStorage;
    }
}