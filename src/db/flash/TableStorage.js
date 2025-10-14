import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ConflictError } from './ConflictError.js';

export class TableStorage extends SimpleEmitter {

    #name;
    #schema;
    #parentNode;

    #materialized;
    #querySpec;
    #options;

    #columns = [];
    #keyColumns = [];

    #keys = new Map;
    #rows = new Map;

    #counters = new Map;

    get name() { return this.#name; }
    get schema() { return this.#schema; }
    get parentNode() { return this.#parentNode; }

    get materialized() { return this.#materialized; }
    get querySpec() { return this.#querySpec; }
    get options() { return this.#options; }

    constructor(schema, parentNode, { materialized = false, querySpec = null, ...options } = {}) {
        super();

        this.#name = schema.name().value();
        this.#schema = schema;
        this.#parentNode = parentNode;

        this.#materialized = materialized;
        this.#querySpec = querySpec;
        this.#options = options;

        this.#columns = schema.columns();

        const pkRefs = this.#schema.pkConstraint(true)?.columns() || [];
        const pkCols = pkRefs.map((pkRef) => this.#schema.get(pkRef));

        this.#keyColumns = pkCols.map((pkCol) => pkCol.name().value());

        this.on('changefeed', (events) => this.#parentNode?.emit('changefeed', events));
    }

    get size() { return this.#rows.size; }

    async *[Symbol.asyncIterator]() {
        for (const [, v] of this.#rows.entries()) {
            yield v;
        }
    }

    async * entries() {
        for (const [k, v] of this.#rows.entries()) {
            yield [k, v];
        }
    }

    async _destroy() {
        this.#parentNode = null;
    }

    async #nextCounter(colName) {
        if (!this.#counters.has(colName)) {
            this.#counters.set(colName, 1);
        }
        const v = this.#counters.get(colName);
        this.#counters.set(colName, v + 1);
        return v;
    }

    // -------- Keys

    async createKey(keyName, type, columns = []) {
        if (this.#keys.has(keyName)) throw new Error(`[${this.#name}] Key ${keyName} already exists`);
        this.#keys.set(keyName, { type, columns, entries: new Map });
    }

    async showKeys(keyName = null) {
        if (keyName) {
            if (!this.#keys.has(keyName)) throw new Error(`[${this.#name}] Key ${keyName} does not exist`);
            return [...this.#keys.get(keyName).entries.keys()];
        }
        return [...this.#rows.keys()];
    }

    async #computeKeys(row, forInsert = false) {
        if (!forInsert && typeof row === 'string') {
            return row;
        }

        const keyValues = [];

        if (forInsert) {
            for (const colSchema of this.#columns) {
                const colName = colSchema.name().value();

                const autoIncr = colSchema.identityConstraint() || colSchema.autoIncrementConstraint();
                const isPKey = this.#keyColumns.includes(colName);

                let v = row[colName];
                if (!v) {
                    if (autoIncr) {
                        v = await this.#nextCounter(colName);
                        row = { ...row, [colName]: v };
                    } else if (isPKey) {
                        throw new Error(`[${this.#name}] Missing value for primary key field ${colName}`);
                    }
                }

                if (isPKey) keyValues.push(v);
            }
        } else if (this.#keyColumns.length) {
            for (const colName of this.#keyColumns) {
                const v = row[colName];
                if (!v) throw new Error(`[${this.#name}] Missing value for primary key field ${colName}`);
                keyValues.push(v);
            }
        }

        let pKey;
        if (keyValues.length) {
            pKey = JSON.stringify(keyValues);
        } else pKey = JSON.stringify(Object.values(row))
        return [pKey, row];
    }

    async #resolveKey(key, keyName = null) {
        if (keyName) {
            if (!this.#keys.has(keyName)) throw new Error(`[${this.#name}] Key ${keyName} does not exist`);
            return this.#keys.get(keyName).entries.get(key);
        }
        return key;
    }

    // ------ CRUD

    async insert(row, { keyName = null, newKey = null } = {}, { transaction = null } = {}) {
        if (keyName && newKey) {
            const pKey = await this.#resolveKey(newKey, keyName);
            if (pKey) {
                const existing = this.#rows.get(pKey);
                throw new ConflictError(`[${this.#name}] Duplicate entry for key ${newKey} on index ${keyName}`, existing);
            }
        }

        let pKey;
        [pKey, row] = await this.#computeKeys(row, true);

        if (this.#rows.has(pKey)) {
            if (!this.#keyColumns.length) {
                const _pKey = pKey;
                let i = 0;
                while (this.#rows.has(pKey = `${_pKey}${i}`)) i++;
            } else {
                const existing = this.#rows.get(pKey);
                throw new ConflictError(`[${this.#name}] Duplicate entry for key ${pKey}`, existing);
            }
        }

        this.#rows.set(pKey, row);
        if (keyName && newKey) {
            this.#keys.get(keyName).entries.set(newKey, pKey);
        }

        const outRow = { ...row };
        transaction?.emit('changefeed', { type: 'insert', relation: { schema: this.#parentNode.name, name: this.#name, keyColumns: [...this.#keyColumns] }, new: outRow });
        if (transaction) return Object.defineProperty(outRow, 'XMAX', { value: 0 }); // Must be 0

        return outRow;
    }

    async update(rowOrKey, row, { keyName = null, newKey = null } = {}, { transaction = null } = {}) {
        let oldPKey;
        if (keyName && typeof rowOrKey === 'string') {
            oldPKey = await this.#resolveKey(rowOrKey, keyName);
        } else if (typeof rowOrKey === 'object' && rowOrKey) {
            [oldPKey] = await this.#computeKeys(rowOrKey, false);
        } else oldPKey = String(rowOrKey);

        let newPKey;
        [newPKey, row] = await this.#computeKeys(row, false);

        const old = this.#rows.get(oldPKey);
        if (!old) throw new Error(`[${this.#name}] Record not found for ${key || newPKey}${keyName ? ` of key ${keyName}` : ''}`);

        this.#rows.set(oldPKey, row);
        if (newPKey !== oldPKey) {
            const reIndexed = [...this.#rows.entries()].map(([k, v]) => [k === oldPKey ? newPKey : k, v]);
            this.#rows = new Map(reIndexed);
        }

        if (keyName) {
            if (newKey) this.#keys.get(keyName).entries.delete(rowOrKey);
            if (newKey || newPKey !== oldPKey) this.#keys.get(keyName).entries.set(newKey || rowOrKey, newPKey);
        }

        const outRow = { ...row };
        transaction?.emit('changefeed', { type: 'update', relation: { schema: this.#parentNode.name, name: this.#name, keyColumns: [...this.#keyColumns] }, old, new: outRow });
        if (transaction) return Object.defineProperty(outRow, 'XMAX', { value: transaction.txId });

        return outRow;
    }

    async delete(rowOrKey, { keyName = null } = {}, { transaction = null } = {}) {
        let pKey;
        if (keyName && typeof rowOrKey === 'string') {
            pKey = await this.#resolveKey(rowOrKey, keyName);
        } else if (typeof rowOrKey === 'object' && rowOrKey) {
            [pKey] = await this.#computeKeys(rowOrKey, false);
        } else pKey = String(rowOrKey);

        const old = this.#rows.get(pKey);
        if (!old) throw new Error(`[${this.#name}] Record not found for ${key}${keyName ? ` of key ${keyName}` : ''}`);

        this.#rows.delete(pKey);

        const outRow = { ...old };
        transaction?.emit('changefeed', { type: 'delete', relation: { schema: this.#parentNode.name, name: this.#name, keyColumns: [...this.#keyColumns] }, old });
        if (transaction) return Object.defineProperty(outRow, 'XMAX', { value: transaction.txId });

        return outRow;
    }

    async get(rowOrKey, { keyName = null } = {}) {
        let pKey;
        if (keyName && typeof rowOrKey === 'string') {
            pKey = await this.#resolveKey(rowOrKey, keyName);
        } else if (typeof rowOrKey === 'object' && rowOrKey) {
            [pKey] = await this.#computeKeys(rowOrKey, false);
        } else pKey = String(rowOrKey);

        return this.#rows.get(pKey);
    }

    async truncate() {
        this.#rows.clear();
        this.#keys.clear();
    }
}