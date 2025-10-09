import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ConflictError } from './ConflictError.js';
import { registry } from '../../lang/registry.js';

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

    async createSchema(schemaName, { ifNotExists = false } = {}) {
        if (await this.#catalog.has(schemaName)) {
            if (ifNotExists) return false;
            throw new Error(`Schema ${schemaName} already exists`);
        }
        await this.#catalog.set(schemaName, {
            schemas: new registry.SchemaSchema({ entries: [] }),
            storage: new Map,
            counters: new Map,
        });
        return true;
    }

    async dropSchema(schemaName, { ifExists = false, cascade = false } = {}) {
        const schemaObject = await this.#catalog.get(schemaName);
        if (!schemaObject) {
            if (ifExists) return false;
            throw new Error(`Schema ${schemaName} does not exist`);
        }
        if (schemaObject.schemas.length && !cascade) {
            throw new Error(`Schema ${schemaName} is not empty.`);
        }
        await this.#catalog.delete(schemaName);
        return true;
    }

    async schemaNames() { return [...(await this.#catalog.keys())]; }

    async getSchema(schemaName) {
        const schemaObject = await this.#catalog.get(schemaName);
        if (!schemaObject) throw new Error(`Schema ${schemaName} does not exist`);
        return schemaObject;
    }

    async createTable(tableSchema, schemaName = this.#defaultSchemaName, { ifNotExists = false, options = {} } = {}) {
        const dialect = options.dialect || this.#dialect;
        // Normalize input
        if (typeof tableSchema === 'string') {
            tableSchema = { name: { value: tableSchema }, entries: [] };
            if (this.#defaultPrimaryKey) {
                const keyCol = {
                    nodeName: 'COLUMN_SCHEMA',
                    name: { value: this.#defaultPrimaryKey },
                    data_type: { value: 'INT' },
                    entries: [{ nodeName: 'COLUMN_PK_CONSTRAINT', value: 'KEY' }],
                };
                if (this.#defaultAutoIncr) {
                    if (dialect === 'mysql') {
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
            // Instantiate
            tableSchema = registry.TableSchema.fromJSON(tableSchema, { dialect });
        } else {
            if (!(tableSchema instanceof registry.TableSchema)) {
                throw new Error(`tableSchema must be an instance of TableSchema`);
            }
            tableSchema = tableSchema.clone();
        }
        // Normalize schema name
        if (tableSchema.name().qualifier()) {
            schemaName = tableSchema.name().qualifier().value();
        }
        // Validate...
        const schemaObject = await this.getSchema(schemaName);
        if (await schemaObject.schemas.has(tableSchema.name().value())) {
            if (ifNotExists) return false;
            throw new Error(`Table ${tableSchema.name()} already exists`);
        }
        // Create
        await schemaObject.schemas.set(tableSchema.name().value(), tableSchema);
        await schemaObject.storage.set(tableSchema.name().value(), new Map);
        return true;
    }

    async dropTable(tableName, schemaName = this.#defaultSchemaName, { ifExists = false, cascade = false } = {}) {
        const schemaObject = await this.getSchema(schemaName);
        if (!schemaObject) return;
        const tableStorage = await schemaObject.storage.get(tableName);
        if (!tableStorage) {
            if (ifExists) return false;
            throw new Error(`Table ${tableName} does not exist`);
        }
        if (tableStorage.length && !cascade) {
            throw new Error(`Table ${schemaName} is not empty.`);
        }
        await schemaObject.counters.delete(tableName);
        await schemaObject.schemas.delete(tableName);
        await schemaObject.storage.delete(tableName);
        return true;
    }

    async tableNames(schemaName = this.#defaultSchemaName) {
        const schemaObject = await this.getSchema(schemaName);
        return [...(await schemaObject.storage.keys())];
    }

    async tableStorage(tableName, schemaName = this.#defaultSchemaName) {
        const schemaObject = await this.getSchema(schemaName);
        if (!schemaObject) return;
        const tableStorage = await schemaObject.storage.get(tableName);
        if (!tableStorage) throw new Error(`Table ${tableName} does not exist`);
        return tableStorage;
    }

    async tableSchema(tableName, schemaName = this.#defaultSchemaName) {
        const schemaObject = await this.getSchema(schemaName);
        const tableSchema = await schemaObject.schemas.get(tableName);
        if (!tableSchema) throw new Error(`Table ${tableName} does not exist`);
        return tableSchema;
    }

    async tableKeyColumns(tableName, schemaName = this.#defaultSchemaName) {
        const tableSchema = await this.tableSchema(tableName, schemaName);
        let pkRefs;
        if ((pkRefs = tableSchema.pkConstraint(true)?.columns())?.length) {
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
        if ((keyColumns = await this.tableKeyColumns(tableName, schemaName)).length) {
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
            const hash = JSON.stringify(values);
            return [hash, keyColumns];
        }

        // no primary key → fallback to whole record
        const hash = JSON.stringify(Object.values(record));
        return [hash, keyColumns];
    }

    async insert(tableName, record, schemaName = this.#defaultSchemaName, { txId } = {}) {
        const tableStorage = await this.tableStorage(tableName, schemaName);
        const stored = { ...record };
        const [_key, _keyColumns] = await this.#computeKey(schemaName, tableName, stored, true);
        let key = _key;
        const existing = await tableStorage.get(_key);
        if (existing) {
            if (_keyColumns.length) throw new ConflictError(`Duplicate key for "${tableName}": ${key}`, existing);
            let i = 0;
            while(await tableStorage.get(key = `${_key}${i}`)) i++;
        }
        await tableStorage.set(key, stored);
        const keyColumns = _keyColumns.map((k) => k.name().value());
        this.emit('changefeed', { type: 'insert', relation: { schema: schemaName, name: tableName, keyColumns }, new: { ...stored }, txId });
        if (txId) return Object.defineProperty({ ...stored }, 'XMAX', { value: 0 }); // Must be 0
        return stored;
    }

    async update(tableName, record, schemaName = this.#defaultSchemaName, { txId } = {}) {
        const tableStorage = await this.tableStorage(tableName, schemaName);
        const stored = { ...record };
        const [key, _keyColumns] = await this.#computeKey(schemaName, tableName, stored, false);
        const old = await tableStorage.get(key);
        if (!old) throw new Error(`Record not found in "${tableName}" for key ${key}`);
        await tableStorage.set(key, stored);
        const keyColumns = _keyColumns.map((k) => k.name().value());
        const _key = Object.fromEntries(keyColumns.map((k) => [k, old[k]]));
        this.emit('changefeed', { type: 'update', relation: { schema: schemaName, name: tableName, keyColumns }, key: _key, old, new: { ...stored }, txId });
        if (txId) return Object.defineProperty({ ...stored }, 'XMAX', { value: txId });
        return stored;
    }

    async delete(tableName, keyOrRecord, schemaName = this.#defaultSchemaName, { txId } = {}) {
        const tableStorage = await this.tableStorage(tableName, schemaName);
        const [key, _keyColumns] = await this.#computeKey(schemaName, tableName, { ...keyOrRecord }, false);
        const old = await tableStorage.get(key);
        if (!old) throw new Error(`Record not found in "${tableName}" for key ${key}`);
        await tableStorage.delete(key);
        const keyColumns = _keyColumns.map((k) => k.name().value());
        const _key = Object.fromEntries(keyColumns.map((k) => [k, old[k]]));
        this.emit('changefeed', { type: 'delete', relation: { schema: schemaName, name: tableName, keyColumns }, key: _key, old, txId });
        if (txId) return Object.defineProperty({ ...old }, 'XMAX', { value: txId });
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
            [key] = await this.#computeKey(schemaName, tableName, { ...keyOrRecord }, false);
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
