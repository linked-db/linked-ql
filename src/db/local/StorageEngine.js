import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { registry } from '../../lang/registry.js';
import { ConflictError } from './ConflictError.js';

export class StorageEngine extends SimpleEmitter {

    #dialect;
    #defaultSchemaName;
    #defaultPrimaryKey;
    #defaultAutoIncr;
    #options;

    #catalog = new Map;

    constructor({
        dialect = 'postgres',
        defaultSchemaName = 'public',
        defaultPrimaryKey = 'id',
        defaultAutoIncr = true,
        ...options
    } = {}) {
        super();
        this.#dialect = dialect;
        this.#defaultSchemaName = defaultSchemaName;
        this.#defaultPrimaryKey = defaultPrimaryKey;
        this.#defaultAutoIncr = defaultAutoIncr;
        this.#options = options;
    }

    async schemaNames() { return [...(await this.#catalog.keys())]; }

    async createSchema(schemaName, unconditionally = true) {
        if (await this.#catalog.has(schemaName)) {
            if (unconditionally) throw new Error(`Schema ${schemaName} already exists`);
            return;
        }
        await this.#catalog.set(schemaName, {
            schemas: new registry.SchemaSchema({ entries: [] }),
            storage: new Map,
            counters: new Map,
        });
    }

    async dropSchema(schemaName, unconditionally = true) {
        if (!await this.#catalog.has(schemaName)) {
            if (unconditionally) throw new Error(`Schema ${schemaName} does not exist`);
            return;
        }
        await this.#catalog.delete(schemaName);
    }

    async getSchema(schemaName, unconditionally = true) {
        const schemaObject = await this.#catalog.get(schemaName);
        if (!schemaObject) {
            if (unconditionally) throw new Error(`Schema ${tableSchema.name()} does not exist`);
            return;
        }
        return schemaObject;
    }

    async tableNames(schemaName = this.#defaultSchemaName) {
        const schemaObject = await this.getSchema(schemaName, unconditionally);
        return [...(await schemaObject.storage.keys())];
    }

    async createTable(tableSchema, schemaName = this.#defaultSchemaName, unconditionally = true) {
        // Normalize
        if (typeof tableSchema === 'string') {
            tableSchema = {
                name: { value: tableSchema },
                entries: [],
            };
            if (this.#defaultPrimaryKey) {
                const keyCol = {
                    nodeName: 'COLUMN_SCHEMA',
                    name: { value: this.#defaultPrimaryKey },
                    data_type: { value: 'INT' },
                    entries: [{ nodeName: 'COLUMN_PK_CONSTRAINT', value: 'KEY' }],
                };
                if (this.#defaultAutoIncr) {
                    if (this.#dialect === 'mysql') {
                        keyCol.entries.push({
                            nodeName: 'MY_COLUMN_AUTO_INCREMENT_MODIFIER',
                            value: 'AUTO_INCREMENT',
                        });
                    } else {
                        keyCol.entries.push({
                            nodeName: 'COLUMN_IDENTITY_CONSTRAINT',
                            by_default_kw: true,
                            as_identity_kw: true,
                        });
                    }
                }
                tableSchema.entries.push(keyCol);
            }
            tableSchema = registry.TableSchema.fromJSON(tableSchema, { dialect: this.#dialect });
        } else if (!(tableSchema = registry.TableSchema)) {
            throw new Error(`tableSchema must be an instance of TableSchema`);
        }
        // Validate...
        const schemaObject = await this.getSchema(schemaName, unconditionally);
        if (!schemaObject) return;
        if (await schemaObject.schemas.has(tableSchema.name().value())) {
            if (unconditionally) throw new Error(`Table ${tableSchema.name()} already exists`);
            return false;
        }
        // Create
        await schemaObject.schemas.set(tableSchema.name().value(), tableSchema);
        await schemaObject.storage.set(tableSchema.name().value(), new Map);
        return true;
    }

    async dropTable(schemaName = this.#defaultSchemaName, unconditionally = true) {
        const schemaObject = await this.getSchema(schemaName, unconditionally);
        if (!schemaObject) return;
        if (!await schemaObject.storage.has(tableName)) {
            if (unconditionally) throw new Error(`Table ${tableName} does not exist`);
            return false;
        }
        await schemaObject.counters.delete(tableName);
        await schemaObject.schemas.delete(tableName);
        await schemaObject.storage.delete(tableName);
    }

    async tableStorage(tableName, schemaName = this.#defaultSchemaName, unconditionally = true) {
        const schemaObject = await this.getSchema(schemaName, unconditionally);
        if (!schemaObject) return;
        const tableStorage = await schemaObject.storage.get(tableName);
        if (!tableStorage) {
            if (unconditionally) throw new Error(`Table ${tableName} does not exist`);
            return false;
        }
        return tableStorage;
    }

    async tableSchema(tableName, schemaName = this.#defaultSchemaName, unconditionally = true) {
        const schemaObject = await this.getSchema(schemaName, unconditionally);
        if (!schemaObject) return;
        const tableSchema = await schemaObject.schemas.get(tableName);
        if (!tableSchema) {
            if (unconditionally) throw new Error(`Table ${tableName} does not exist`);
            return false;
        }
        return tableSchema;
    }

    async tableKeyColumns(tableName, schemaName = this.#defaultSchemaName) {
        const tableSchema = await this.tableSchema(tableName, schemaName);
        let pkRefs;
        if ((pkRefs = tableSchema?.pkConstraint(true)?.columns())?.length) {
            return pkRefs.map((pkRef) => tableSchema.get(pkRef));
        }
        return [];
    }

    async #nextCounter(schemaName, tableName, field) {
        const schemaObject = await this.getSchema(schemaName);
        const key = `${tableName}:${field}`;
        if (!await schemaObject.counters.has(key)) {
            await schemaObject.counters.set(key, 1);
        }
        const v = await schemaObject.counters.get(key);
        await schemaObject.counters.set(key, v + 1);
        return v;
    }

    async #computeKey(schemaName, tableName, record, forInsert = false) {
        let keyColumns;
        if (keyColumns = await this.tableKeyColumns(tableName, schemaName)) {
            const autoIncr = keyColumns.some((keyCol) => (keyCol.identityConstraint() || keyCol.autoIncrementConstraint()));

            const values = [];
            for (const keyCol of keyColumns) {
                const colName = keyCol.name().value();
                let v = record[colName];
                if (v == null) {
                    if (forInsert && autoIncr) {
                        v = await this.#nextCounter(schemaName, tableName, colName);
                        record[colName] = v; // fill back into row
                    } else {
                        throw new Error(`Missing value for primary key field ${keyCol.name()} in table "${tableName}"`);
                    }
                }
                values.push(v);
            }
            return JSON.stringify(values);
        }

        // no primary key → fallback to whole record
        return JSON.stringify(Object.values(record));
    }

    async insert(tableName, record, schemaName = this.#defaultSchemaName) {
        const tableStorage = await this.tableStorage(tableName, schemaName);
        const stored = { ...record };
        const key = await this.#computeKey(schemaName, tableName, stored, true);
        const existing = await tableStorage.get(key);
        if (existing) throw new ConflictError(`Duplicate key for "${tableName}": ${key}`, existing);
        await tableStorage.set(key, stored);
        const keyColumns = (await this.tableKeyColumns(schemaName, tableName)).map((k) => k.name().value());
        this.emit('mutation', { type: 'insert', relation: { schema: schemaName, name: tableName, keyColumns }, new: { ...stored } });
        return stored;
    }

    async update(tableName, record, schemaName = this.#defaultSchemaName) {
        const tableStorage = await this.tableStorage(tableName, schemaName);
        const stored = { ...record };
        const key = await this.#computeKey(schemaName, tableName, stored, false);
        const old = await tableStorage.get(key);
        if (!old) throw new Error(`Record not found in "${tableName}" for key ${key}`);
        await tableStorage.set(key, stored);
        const keyColumns = (await this.tableKeyColumns(schemaName, tableName)).map((k) => k.name().value());
        const _key = Object.fromEntries(keyColumns.map((k) => [k, old[k]]));
        this.emit('mutation', { type: 'update', relation: { schema: schemaName, name: tableName, keyColumns }, key: _key, old, new: { ...stored } });
        return stored;
    }

    async delete(tableName, keyOrRecord, schemaName = this.#defaultSchemaName) {
        const tableStorage = await this.tableStorage(tableName, schemaName);
        const key = await this.#computeKey(schemaName, tableName, { ...keyOrRecord }, false);
        const old = await tableStorage.get(key);
        if (!old) throw new Error(`Record not found in "${tableName}" for key ${key}`);
        await tableStorage.delete(key);
        const keyColumns = (await this.tableKeyColumns(tableName)).map((k) => k.name().value());
        const _key = Object.fromEntries(keyColumns.map((k) => [k, old[k]]));
        this.emit('mutation', { type: 'delete', relation: { schema: schemaName, name: tableName, keyColumns }, key: _key, old });
        return old;
    }

    async fetch(tableName, keyOrRecord, schemaName = this.#defaultSchemaName) {
        const tableStorage = await this.tableStorage(tableName, schemaName);

        let key;
        if (typeof keyOrRecord === 'string') {
            // already a computed key
            key = keyOrRecord;
        } else if (typeof keyOrRecord === 'object' && keyOrRecord !== null) {
            // compute key from record-like object
            key = await this.#computeKey(schemaName, tableName, { ...keyOrRecord }, false);
        } else {
            throw new Error(`Invalid keyOrRecord type for fetch(): ${typeof keyOrRecord}`);
        }

        const record = await tableStorage.get(key);
        return record ? { ...record } : undefined; // defensive copy
    }

    async *getCursor(tableName, schemaName = this.#defaultSchemaName) {
        const tableStorage = await this.tableStorage(tableName, schemaName);
        for await (const record of tableStorage.values()) {
            yield { ...record }; // defensive copy
        }
    }
}
