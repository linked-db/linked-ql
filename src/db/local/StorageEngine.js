import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { SchemaSchema } from '../../lang/ddl/schema/SchemaSchema.js';
import { TableSchema } from '../../lang/ddl/table/TableSchema.js';

export class StorageEngine extends SimpleEmitter {

    #tables = new Map();
    #schemas = new SchemaSchema({ entries: [] });
    #options;
    #counters = new Map();

    constructor(options = {}) {
        super();
        this.#options = {
            defaultPrimaryKey: options.defaultPrimaryKey || 'id',
            defaultAutoIncr: !!(options.defaultAutoIncr ?? true),
            ...options
        };
    }

    async createTable(tableSchemaJson) {
        if (typeof tableSchemaJson === 'string') {
            tableSchemaJson = {
                name: { value: tableSchemaJson },
                entries: [],
            };
            if (this.#options.defaultPrimaryKey) {
                const pkCol = {
                    nodeName: 'COLUMN_SCHEMA',
                    name: { value: this.#options.defaultPrimaryKey },
                    data_type: { value: 'INT' },
                    entries: [{ nodeName: 'COLUMN_PK_CONSTRAINT', value: 'KEY' }],
                };
                if (this.#options.defaultPrimaryKey) {
                    pkCol.entries.push({
                        nodeName: 'COLUMN_IDENTITY_CONSTRAINT',
                        by_default_kw: true,
                        as_identity_kw: true,
                    });
                }
                tableSchemaJson.entries.push(pkCol);
            }
        }
        const tableSchema = TableSchema.fromJSON(tableSchemaJson, { dialect: 'postgres' });
        if (this.#schemas.has(tableSchema.name())) {
            throw new Error(`Table ${tableSchema.name()} already exists`);
        }
        this.#schemas.add(tableSchema);
        this.#tables.set(tableSchema.name().value(), new Map);
        return true;
    }

    async tableNames() { return this.#schemas.tables().map((t) => t.name().value()); }

    async tableSchema(table) { return this.#schemas.get(table); }

    async tablePK(table) {
        const tableSchema = await this.tableSchema(table);
        let pkRefs;
        if ((pkRefs = tableSchema?.pkConstraint(true)?.columns())?.length) {
            return pkRefs.map((pkRef) => tableSchema.get(pkRef));
        }
    }

    #nextCounter(table, field) {
        const key = `${table}:${field}`;
        if (!this.#counters.has(key)) {
            this.#counters.set(key, 1);
        }
        const v = this.#counters.get(key);
        this.#counters.set(key, v + 1);
        return v;
    }

    async #computeKey(table, record, forInsert = false) {
        let pkCols;
        if (pkCols = await this.tablePK(table)) {
            const autoIncr = pkCols.some((pkCol) => (pkCol.identityConstraint() || pkCol.autoIncrementConstraint()));

            const values = [];
            for (const pkCol of pkCols) {
                const colName = pkCol.name().value();
                let v = record[colName];
                if (v == null) {
                    if (forInsert && autoIncr && pkCols.length === 1) {
                        v = this.#nextCounter(table, colName);
                        record[colName] = v; // fill back into row
                    } else {
                        throw new Error(`Missing value for primary key field ${pkCol.name()} in table "${table}"`);
                    }
                }
                values.push(v);
            }
            return JSON.stringify(values);
        }

        // no primary key → fallback to whole record
        return JSON.stringify(Object.values(record));
    }

    async insert(table, record) {
        if (!this.#schemas.get(table)) {
            throw new Error(`Table "${table}" does not exist`);
        }
        const t = this.#tables.get(table) || new Map();
        this.#tables.set(table, t);
        const stored = { ...record };
        const key = await this.#computeKey(table, stored, true);
        if (t.has(key)) throw new Error(`Duplicate key for "${table}": ${key}`);
        t.set(key, stored);
        const keyColumns = (await this.tablePK(table)).map((k) => k.name().value());
        this.emit('mutation', { type: 'insert', relation: { name: table, keyColumns }, new: { ...stored } });
        return key;
    }

    async update(table, record) {
        const t = this.#tables.get(table);
        if (!t) throw new Error(`Table "${table}" does not exist`);
        const stored = { ...record };
        const key = await this.#computeKey(table, stored, false);
        const old = t.get(key);
        if (!old) throw new Error(`Record not found in "${table}" for key ${key}`);
        t.set(key, stored);
        const keyColumns = (await this.tablePK(table)).map((k) => k.name().value());
        const _key = Object.fromEntries(keyColumns.map((k) => [k, old[k]]));
        this.emit('mutation', { type: 'update', relation: { name: table, keyColumns }, key: _key, old, new: { ...stored } });
        return key;
    }

    async delete(table, record) {
        const t = this.#tables.get(table);
        if (!t) throw new Error(`Table "${table}" does not exist`);
        const key = await this.#computeKey(table, { ...record }, false);
        const old = t.get(key);
        if (!old) throw new Error(`Record not found in "${table}" for key ${key}`);
        t.delete(key);
        const keyColumns = (await this.tablePK(table)).map((k) => k.name().value());
        const _key = Object.fromEntries(keyColumns.map((k) => [k, old[k]]));
        this.emit('mutation', { type: 'delete', relation: { name: table, keyColumns }, key: _key, old });
        return key;
    }

    async get(table, keyOrRecord) {
        const t = this.#tables.get(table);
        if (!t) throw new Error(`Table "${table}" does not exist`);

        let key;
        if (typeof keyOrRecord === 'string') {
            // already a computed key
            key = keyOrRecord;
        } else if (typeof keyOrRecord === 'object' && keyOrRecord !== null) {
            // compute key from record-like object
            key = await this.#computeKey(table, { ...keyOrRecord }, false);
        } else {
            throw new Error(`Invalid keyOrRecord type for get(): ${typeof keyOrRecord}`);
        }

        const row = t.get(key);
        return row ? { ...row } : undefined; // defensive copy
    }

    async *scan(table) {
        const t = this.#tables.get(table);
        if (!t) return;
        for (const row of t.values()) {
            yield { ...row }; // defensive copy
        }
    }
}
