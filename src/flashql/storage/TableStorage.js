import { ConflictError } from '../ConflictError.js';
import { ExprEngine } from '../eval/ExprEngine.js';
import { registry } from '../../lang/registry.js';

const INDEX_KEY_CACHE = Symbol.for('flashql:index_key_cache');
export const SYSTEM_TAG = Symbol.for('system_tag');

export class TableStorage {

    #tx;
    #schema;
    #namespace;
    #name;

    #rows;
    #indexes = new Map;

    #dialect;
    #materialized;
    #querySpec;

    #exprEngine;
    #exprCache = new Map;

    get schema() { return this.#schema; }
    get rows() { return this.#rows; }
    get indexes() { return this.#indexes; }

    get namespace() { return this.#namespace; }
    get name() { return this.#name; }

    get dialect() { return this.#dialect; }
    get materialized() { return this.#materialized; }
    get querySpec() { return this.#querySpec; }

    get options() {
        return {
            dialect: this.#dialect,
            materialized: this.#materialized,
            querySpec: this.#querySpec,
        };
    }

    constructor(tx, schema, { dialect = null, materialized = false, querySpec = null } = {}) {
        this.#tx = tx;
        this.#schema = schema;
        this.#name = schema.name;
        this.#namespace = schema.namespace_id.name;

        let { rows, indexes } = this.#tx.engine._catalog.get(schema.id) || {};
        if (!rows) {
            rows = new Map;
            indexes = new Map;
            this.#tx.engine._catalog.set(schema.id, { rows, indexes });
        }

        this.#rows = rows;
        this.#indexes = indexes;

        this.#dialect = dialect;
        this.#materialized = materialized;
        this.#querySpec = querySpec;

        this.#exprEngine = new ExprEngine(null, { dialect: this.#dialect });
    }

    async _destroy() {
        const artifact = { tx: this.#tx };
        this.#tx = null;
        return artifact;
    }

    async _restore({ tx }) {
        this.#tx = tx;
    }

    // ----- mvcc -----

    #getVisibleVersion(rows, key, multiple = false) {
        const chain = rows?.get(key);
        let result = multiple ? [] : null;

        if (!chain) return result;

        for (let i = chain.length - 1; i >= 0; i--) {
            const v = chain[i];
            if (this.#isVisible(v)) {
                this.#tx.trackRead(v, key);
                if (multiple) result.push(v);
                else return v;
            }
        }

        return result;
    }

    #isVisible(version) {
        if (version.XMIN === this.#tx.id) {
            return !this.#tx.matchXMAX(version, this.#tx.id);
        }

        const xminMeta = this.#tx.engine.txMeta(version.XMIN);
        if (xminMeta?.state !== 'committed') return false;
        if (xminMeta.commitTime > this.#tx.snapshot) return false;

        if (version.XMAX === 0) return true;

        // if not 0, v.XMAX CAN BE an array
        // on transactions with strategy === FirstCommitterWins
        return [].concat(version.XMAX).every((xmax) => {
            if (xmax === this.#tx.id) return false;
            const meta = this.#tx.engine.txMeta(xmax);

            if (!meta) return true;
            if (meta.state === 'aborted') return true;
            if (meta.state === 'active') return true;
            if (meta.commitTime > this.#tx.snapshot) return true;
            return false;
        });
    }

    // ----- row construction -----

    #buildRow(input, base = null, { systemTag = null } = {}) {
        for (const colName in input) {
            if (!this.#schema.columns.has(colName)) {
                throw new TypeError(`[${this.#name}] Unknown column ${colName}`);
            }
        }

        const row = {};

        for (const [colName, col] of this.#schema.columns) {
            const hasValue = colName in input;

            if (col.is_generated && col.generation_expr_ast && hasValue) {
                throw new TypeError(`[${this.#name}] Cannot insert into generated column ${colName}`);
            }

            if (col.is_generated && !col.generation_expr_ast && col.generation_rule === 'always' && hasValue) {
                throw new TypeError(`[${this.#name}] Cannot insert into identity column ${colName}`);
            }

            if (col.engine_attrs?.is_system_column && hasValue && systemTag !== SYSTEM_TAG) {
                throw new TypeError(`[${this.#name}] Cannot insert into system column ${colName}`);
            }

            row[colName] = !hasValue && base ? base[colName] : input[colName];

            if (hasValue || base) continue;
            // Otherwise handle missing columns?

            const autoIncr =
                col.is_generated && !col.generation_expr_ast ||
                col.type_id.name === 'SERIAL' ||
                col.engine_attrs?.auto_increment;

            if (autoIncr ||
                col.default_expr_ast ||
                !col.not_null) continue;

            throw new TypeError(`[${this.#name}] Missing value for required field ${colName}`);
        }

        return row;
    }

    async #applyColumnDefaults(input, { forColumns = null } = {}) {
        const rowCtx = { [this.#name]: input };

        for (const [colName, col] of this.#schema.columns) {

            let exprAst;
            if (forColumns) {
                if (!forColumns.includes(colName)) continue;
                if (!col.default_expr_ast)
                    throw new Error(`No default expression for column ${colName}`);
                exprAst = col.default_expr_ast;
            } else {
                if (col.default_expr_ast
                    && input[colName] === undefined) {
                    exprAst = col.default_expr_ast;
                } else if (col.generation_expr_ast) {
                    exprAst = col.generation_expr_ast;
                } else continue;
            }

            const cacheKey = `${col.id}:expr`;
            let exprNode = this.#exprCache.get(cacheKey);

            if (!exprNode) {
                exprNode = registry.Expr.fromJSON(exprAst, { dialect: this.#dialect, assert: true });
                this.#exprCache.set(cacheKey, exprNode);
            }

            input[colName] = await this.#exprEngine.evaluateToScalar(exprNode, rowCtx);
        }
    }

    // ----- sequences/defaults -----

    #nextSequence(colName) {
        const seqId = [
            this.#schema.namespace_id.id,
            this.#schema.id,
            colName
        ].join('|');
        return this.#tx.nextSequence(seqId);
    }

    #ensureSequenceAtLeast(colName, nextValue) {
        const seqId = [
            this.#schema.namespace_id.id,
            this.#schema.id,
            colName
        ].join('|');
        this.#tx.engine._ensureSequenceAtLeast(seqId, nextValue);
    }

    #applyAutoIncr(input) {
        for (const [colName, col] of this.#schema.columns) {
            const autoIncr =
                col.is_generated && !col.generation_expr_ast ||
                col.type_id.name === 'SERIAL' ||
                col.engine_attrs?.auto_increment;

            if (!autoIncr) continue;

            if (input[colName] !== undefined && input[colName] !== null) {
                this.#ensureSequenceAtLeast(colName, Number(input[colName]) + 1);
                continue; // user supplied explicit value
            }

            input[colName] = this.#nextSequence(colName);
        }
    }

    #runTypeChecks(input) {
        for (const [colName, col] of this.#schema.columns) {
            const value = input[colName];
            if (value === undefined || value === null) continue;

            switch (col.type_id.name) {
                case 'INT':
                case 'BIGINT':
                case 'SERIAL':
                    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
                        throw new TypeError(`[${this.#name}] Invalid value for ${colName}: expected ${col.type_id.name}`);
                    }
                    break;
                case 'TEXT':
                    if (typeof value !== 'string') {
                        throw new TypeError(`[${this.#name}] Invalid value for ${colName}: expected TEXT`);
                    }
                    break;
                case 'BOOLEAN':
                    if (typeof value !== 'boolean') {
                        throw new TypeError(`[${this.#name}] Invalid value for ${colName}: expected BOOLEAN`);
                    }
                    break;
                case 'JSON':
                    if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
                        throw new TypeError(`[${this.#name}] Invalid value for ${colName}: expected JSON`);
                    }
                    break;
                default:
                    break;
            }
        }
    }

    async #runUKChecks(input, { skip = null } = {}) {
        for (const [idxName, idxDef] of this.#schema.indexes) {
            if (!idxDef.is_unique) continue;

            const idxRows = this.#indexes.get(idxDef.id);
            if (!idxRows) continue;

            let key;

            if (idxDef.kind === 'column') {
                const keyColumns = idxDef.column_ids.map((x) => x.name);
                key = this.#deriveKey(keyColumns, input);
            } else {
                key = await this.#deriveExpressionIndexKey(idxDef, input);
            }

            const visible = this.#getVisibleVersion(
                idxRows,
                key,
                true
            );

            for (const v of visible) {
                if (skip && v === skip) continue;

                throw new ConflictError(`[${this.#name}] Duplicate entry for unique index "${idxName}" key ${key}`, v);
            }
        }
    }

    #runFKChecks(input) {
        for (const { name: conName, ...conDef } of this.#schema.constraints?.get('FOREIGN KEY') || []) {

            const targetTable = this.#tx.getTable(conDef.fk_target_relation_id);
            const matchRule = (conDef.fk_match_rule || 'NONE').toUpperCase();

            const parts = conDef.column_ids.map((c, i) => ({
                sourceValue: input[c.name],
                targetCol: conDef.fk_target_column_ids[i].name,
            }));
            const isNullish = (v) => [undefined, null].includes(v);
            const nullCount = parts.reduce((n, p) => n + (isNullish(p.sourceValue) ? 1 : 0), 0);
            const hasNullPart = nullCount > 0;
            const allNull = nullCount === parts.length;

            // MATCH FULL: either all referencing parts are null, or none are.
            if (matchRule === 'FULL') {
                if (allNull) continue;
                if (hasNullPart) {
                    throw new ReferenceError(`[${this.#name}] Foreign key constraint violation: "${conName}"`);
                }
            } else if (matchRule === 'PARTIAL') {
                // MATCH PARTIAL: if partially null, referenced row must match non-null parts.
                if (allNull) continue;
                if (hasNullPart) {
                    const partial = parts.filter((p) => !isNullish(p.sourceValue));
                    const existsPartial = targetTable.getAll().some((row) =>
                        partial.every((p) => row[p.targetCol] === p.sourceValue)
                    );

                    if (!existsPartial) {
                        throw new ReferenceError(`[${this.#name}] Foreign key constraint violation: "${conName}"`);
                    }
                    continue;
                }
            } else {
                // MATCH NONE/SIMPLE: if any referencing part is null, skip FK validation.
                if (hasNullPart) continue;
            }

            const pkWhere = Object.fromEntries(parts.map(
                (p) => [p.targetCol, p.sourceValue]
            ));

            const targetColNames = parts.map((p) => p.targetCol);
            const targetIndexName = [...targetTable.schema.indexes.entries()].find(([, idxDef]) => {
                if (idxDef.kind !== 'column') return false;
                if (idxDef.column_ids.length !== targetColNames.length) return false;
                return idxDef.column_ids.every((col, i) => col.name === targetColNames[i]);
            })?.[0];

            const matches = targetIndexName
                ? targetTable.exists(pkWhere, { using: targetIndexName })
                : targetTable.getAll().some((row) =>
                    parts.every((p) => row[p.targetCol] === p.sourceValue)
                );

            if (!matches) {
                throw new ReferenceError(`[${this.#name}] Foreign key constraint violation: "${conName}"`);
            }
        }
    }

    #runReverseFKRoutines(op, version, isCommitTime = true, newRow = null) {
        const sysConstraints = this.#tx.getTable({ namespace: 'sys', name: 'sys_constraints' });
        const incomingRefDefs = sysConstraints.get({ fk_target_relation_id: this.#schema.id }, { using: 'sys_constraints__fk_target_relation_id_idx', multiple: true });

        const handlers = [];
        let hasDeferred = false;

        for (let conDef of incomingRefDefs) {
            const referencingTable = this.#tx.getTable({ id: conDef.relation_id });
            conDef = referencingTable.schema.constraints.get('FOREIGN KEY').find((c) => c.id === conDef.id);

            const correlation = (version) => Object.fromEntries(conDef.fk_target_column_ids.map(
                (c, i) => [conDef.column_ids[i].name, version ? version[c.name] : null]
            ));

            const fkWhere = correlation(version);
            if (op === 'update' && newRow) {
                const newFkWhere = correlation(newRow);
                const changed = Object.keys(fkWhere).some((k) => fkWhere[k] !== newFkWhere[k]);
                if (!changed) continue;
            }

            const result = referencingTable.get(fkWhere, { using: conDef.name.replace(/_fk$/, '_idx'), multiple: true });

            if (result.length) {
                const rule = conDef[`fk_${op}_rule`];

                if (rule === 'NO ACTION' && !isCommitTime) {
                    hasDeferred = true;
                    continue;
                }

                if (['NO ACTION', 'RESTRICT'].includes(rule)) {
                    throw new ReferenceError(`[${this.#name}] Foreign key constraint violation: "${conDef.name}" by ${op} operation`);
                }

                if (rule === 'CASCADE') {
                    for (let v of result) {
                        handlers.push(async () => {
                            if (op === 'update') {
                                await referencingTable.update(v, correlation(newRow));
                            } else await referencingTable.delete(v);
                        });
                    }
                }

                if (rule === 'SET NULL') {
                    for (let v of result) {
                        handlers.push(async () => {
                            await referencingTable.update(v, correlation(null));
                        });
                    }
                }

                if (rule === 'SET DEFAULT') {
                    for (let v of result) {
                        handlers.push(async () => {
                            const candidate = { ...v };
                            await referencingTable.#applyColumnDefaults(candidate, { forColumns: conDef.column_ids.map((c) => c.name) });

                            await referencingTable.update(v, candidate);
                        });
                    }
                }
            }
        }

        return { handlers, hasDeferred };
    }

    // ----- keys/indexes -----

    async #deriveExpressionIndexKey(idxDef, version) {
        const versionIndexKeys = version[INDEX_KEY_CACHE];
        if (versionIndexKeys && idxDef.id in versionIndexKeys) {
            return versionIndexKeys[idxDef.id];
        }

        const cacheKey = `${idxDef.id}:index_expr`;
        let exprNode = this.#exprCache.get(cacheKey);

        if (!exprNode) {
            exprNode = registry.Expr.fromJSON(idxDef.expression_ast, { dialect: this.#dialect, assert: true });
            this.#exprCache.set(cacheKey, exprNode);
        }

        const value = await this.#exprEngine.evaluateToScalar(exprNode, { [this.#name]: version });
        const key = JSON.stringify([[undefined, null].includes(value) ? '' : value]);

        if (!version[INDEX_KEY_CACHE]) {
            Object.defineProperty(version, INDEX_KEY_CACHE, { value: {}, enumerable: false });
        }
        version[INDEX_KEY_CACHE][idxDef.id] = key;

        return key;
    }

    async addToIndexes(indexes, version) {
        for (const idxDef of indexes.values()) {

            let idxRows = this.#indexes.get(idxDef.id);
            if (!idxRows) {
                idxRows = new Map;
                this.#indexes.set(idxDef.id, idxRows);
            }

            let key;

            if (idxDef.kind === 'column') {
                const keyColumns = idxDef.column_ids.map((x) => x.name);
                key = this.#deriveKey(keyColumns, version, false);
            } else {
                key = await this.#deriveExpressionIndexKey(idxDef, version);
            }

            if (!idxRows.has(key)) {
                idxRows.set(key, []);
            }

            idxRows.get(key).push(version);
        }
    }

    removeFromIndexes(indexes, version) {
        for (const idxDef of indexes.values()) {
            const idxRows = this.#indexes.get(idxDef.id);
            if (!idxRows) continue;

            let key;

            if (idxDef.kind === 'column') {
                const keyColumns = idxDef.column_ids.map((x) => x.name);
                key = this.#deriveKey(keyColumns, version, false);
            } else {
                key = version[INDEX_KEY_CACHE]?.[idxDef.id];
                if (key === undefined) continue;
            }

            const bucket = idxRows.get(key);
            if (!bucket) continue;

            const idx = bucket.indexOf(version);
            if (idx !== -1) {
                bucket.splice(idx, 1);
            }

            if (!bucket.length) idxRows.delete(key);
        }
    }

    #deriveKey(keyColumns, version, assert = true) {
        const keyValues = [];

        for (const colName of keyColumns) {
            if (!(colName in version) && assert)
                throw new TypeError(`[${this.#name}] Missing value for primary key field ${colName}`);

            const v = version[colName];
            keyValues.push([undefined, null].includes(v) ? '' : v);
        }

        return JSON.stringify(keyValues);
    }

    #formatKey(idxValue, keyName = null) {
        let keyColumns;
        let keyDesc;

        if (keyName) {
            const idxDef = this.#schema.indexes.get(keyName);
            if (!idxDef) throw new ReferenceError(`[${this.#name}] Invalid index name ${keyName}`);
            if (idxDef.kind !== 'column')
                throw new Error(`[${this.#name}] Index kind ${idxDef.kind} not supported at the moment`);

            keyColumns = idxDef.column_ids.map((x) => x.name);
            keyDesc = `${keyName} index`;
        } else {
            keyColumns = this.#schema.keyColumns;
            keyDesc = 'primary key';
        }

        if (!Array.isArray(idxValue) && typeof idxValue === 'object' && idxValue) {
            return this.#deriveKey(keyColumns, idxValue);
        }

        const format = (_idxValue) => {
            if (_idxValue.length !== keyColumns.length)
                throw new Error(`[${this.#name}] Invalid ${keyDesc} value ${idxValue}`);
            return JSON.stringify(_idxValue);
        };

        // a. ---- Array
        if (Array.isArray(idxValue)) {
            return format(idxValue);
        }

        // b. ---- Strings/scalars
        return format([].concat(idxValue));
    }

    // ------------

    count() {
        return this.getAll().length;
    }

    exists(key, { using: keyName } = {}) {
        return !!this.get(key, { using: keyName, existsCheck: true });
    }

    get(key, { using: keyName, multiple = false, hiddenCols = true, existsCheck } = {}) {
        key = this.#formatKey(key, keyName);

        let keyId;
        let keyColumns;

        if (keyName) {
            keyId = this.#schema.indexes.get(keyName)?.id;
            if (!keyId) throw new ReferenceError(`[${this.#name}] Invalid index name ${keyName}`);
            keyColumns = this.#schema.indexes.get(keyName).column_ids.map((x) => x.name);
        } else {
            keyColumns = this.#schema.keyColumns;
        }

        const rows = keyId
            ? this.#indexes.get(keyId)
            : this.#rows;

        this.#tx.trackPredicateRead({
            relation: this.#name,
            namespace: this.#namespace,
            keyExtractor: (row) => this.#deriveKey(keyColumns, row),
            matches: (row) => this.#deriveKey(keyColumns, row) === key,
        });

        const result = this.#getVisibleVersion(rows, key, !!multiple);

        if (existsCheck) return !!result;

        const finailizeColProps = (colProps) => {
            if (!hiddenCols) {
                for (const k in colProps) {
                    if (k.startsWith('__'))
                        delete colProps[k];
                }
            }
            return colProps;
        };

        if (multiple) {
            return result.map((c) => {
                const colProps = Object.getOwnPropertyDescriptors(c);
                return Object.defineProperties({}, finailizeColProps(colProps));
            });
        }

        const colProps = result && Object.getOwnPropertyDescriptors(result);
        return result && Object.defineProperties({}, finailizeColProps(colProps));
    }

    getAll({ using: keyName, hiddenCols = true } = {}) {
        let keyId;
        let keyColumns;

        if (keyName) {
            keyId = this.#schema.indexes.get(keyName)?.id;
            if (!keyId) throw new ReferenceError(`[${this.#name}] Invalid index name ${keyName}`);
            keyColumns = this.#schema.indexes.get(keyName).column_ids.map((x) => x.name);
        } else {
            keyColumns = this.#schema.keyColumns;
        }

        const rows = keyId
            ? this.#indexes.get(keyId)
            : this.#rows;

        this.#tx.trackPredicateRead({
            relation: this.#name,
            namespace: this.#namespace,
            keyExtractor: (row) => this.#deriveKey(keyColumns, row),
            matches: () => true,
        });

        const finailizeColProps = (colProps) => {
            if (!hiddenCols) {
                for (const k in colProps) {
                    if (k.startsWith('__'))
                        delete colProps[k];
                }
            }
            return colProps;
        };

        const result = [];

        for (const [key] of rows) {
            if (keyId) {
                const vv = this.#getVisibleVersion(rows, key, true);
                result.push(...vv);
            } else {
                const v = this.#getVisibleVersion(rows, key);
                if (v) result.push(v);
            }
        }

        return result.map((c) => {
            const colProps = Object.getOwnPropertyDescriptors(c);
            return Object.defineProperties({}, finailizeColProps(colProps));
        });
    }

    async insert(newRow, { systemTag = null } = {}) {
        newRow = this.#buildRow(newRow, null, { systemTag });
        await this.#applyColumnDefaults(newRow);
        this.#applyAutoIncr(newRow);

        // --- Resolve new PK
        const newPk = this.#deriveKey(this.#schema.keyColumns, newRow);

        const conflicting = this.#getVisibleVersion(this.#rows, newPk);
        if (conflicting) {
            throw new ConflictError(`[${this.#name}] Duplicate entry for key ${newPk}`, conflicting);
        }

        // --- Assert data consistency
        this.#runTypeChecks(newRow);
        await this.#runUKChecks(newRow);
        this.#runFKChecks(newRow);

        // --- Track
        this.#tx.trackInsertWrite(newRow, newPk);

        // --- Build new version
        this.#tx.setXMAX(this.#tx.setXMIN(newRow, this.#tx.id), 0);

        // --- Add to rows and indexes
        if (!this.#rows.has(newPk))
            this.#rows.set(newPk, []);
        this.#rows.get(newPk).push(newRow);

        await this.addToIndexes(this.#schema.indexes, newRow);

        // Add undo
        this.#tx.addUndo(() => {
            const chain = this.#rows.get(newPk);
            const idx = chain.indexOf(newRow);
            if (idx !== -1) chain.splice(idx, 1);
            this.removeFromIndexes(this.#schema.indexes, newRow);
        });

        // --- Record change
        this.#tx.recordChange({
            op: 'insert',
            relation: {
                namespace: this.#namespace,
                name: this.#name,
                keyColumns: [...this.#schema.keyColumns]
            },
            new: newRow
        });

        return newRow;
    }

    async update(oldPk, newRow, { systemTag = null } = {}) {
        oldPk = this.#formatKey(oldPk);

        const oldRow = this.#getVisibleVersion(this.#rows, oldPk);
        if (!oldRow) {
            throw new ReferenceError(`[${this.#name}] Record not found for ${oldPk}`);
        }

        // --- Build new version and resolve new PK
        newRow = this.#buildRow(newRow, oldRow, { systemTag });
        await this.#applyColumnDefaults(newRow);

        // --- Assert data consistency
        this.#runTypeChecks(newRow);
        await this.#runUKChecks(newRow, { skip: oldRow });
        this.#runFKChecks(newRow);

        const newPk = this.#deriveKey(this.#schema.keyColumns, newRow);

        if (newPk !== oldPk) {
            const conflicting = this.#getVisibleVersion(this.#rows, newPk);
            if (conflicting) {
                throw new ConflictError(`[${this.#name}] Duplicate entry for primary key ${newPk}`, conflicting);
            }
        }
        const fKRulesResult = this.#runReverseFKRoutines('update', oldRow, false, newRow);

        // --- Track
        // --- This must come first before setting XMAX below
        this.#tx.trackWrite(oldRow, oldPk);

        this.#tx.setXMAX(this.#tx.setXMIN(newRow, this.#tx.id), 0);
        this.#tx.setXMAX(oldRow, this.#tx.id);

        // --- Add to rows and indexes
        if (!this.#rows.has(newPk))
            this.#rows.set(newPk, []);
        this.#rows.get(newPk).push(newRow);

        await this.addToIndexes(this.#schema.indexes, newRow);

        if (fKRulesResult) {
            for (const fn of fKRulesResult.handlers) await fn();
            if (fKRulesResult.hasDeferred) {
                this.#tx.addFinallizer(() => {
                    this.#runReverseFKRoutines('update', oldRow, true, newRow);
                });
            }
        }

        // --- Add undo logic
        this.#tx.addUndo(() => {
            if (this.#tx.matchXMAX(oldRow, this.#tx.id)) {
                this.#tx.resetXMAX(oldRow, 0);
            }

            const rowChain = this.#rows.get(newPk);
            if (rowChain) {
                const idx = rowChain.indexOf(newRow);
                if (idx !== -1) rowChain.splice(idx, 1);
                if (!rowChain.length) this.#rows.delete(newPk);
            }

            this.removeFromIndexes(this.#schema.indexes, newRow);
        });

        // --- Record change
        this.#tx.recordChange({
            op: 'update',
            relation: {
                namespace: this.#namespace,
                name: this.#name,
                keyColumns: [...this.#schema.keyColumns]
            },
            old: oldRow,
            new: newRow
        });

        return newRow;
    }

    async delete(oldPk) {
        oldPk = this.#formatKey(oldPk);

        const oldRow = this.#getVisibleVersion(this.#rows, oldPk);
        if (!oldRow) throw new ReferenceError(`[${this.#name}] Record not found for ${oldPk}`);

        const fKRulesResult = this.#runReverseFKRoutines('delete', oldRow, false);
        for (const fn of fKRulesResult.handlers) await fn();
        if (fKRulesResult.hasDeferred) {
            this.#tx.addFinallizer(() => {
                this.#runReverseFKRoutines('delete', oldRow, true);
            });
        }

        // --- Track
        // --- This must come first before setting XMAX below
        this.#tx.trackWrite(oldRow, oldPk);

        this.#tx.setXMAX(oldRow, this.#tx.id);

        // --- Add undo
        this.#tx.addUndo(() => {
            if (this.#tx.matchXMAX(oldRow, this.#tx.id)) {
                this.#tx.resetXMAX(oldRow, 0);
            }
        });

        // --- Record change
        this.#tx.recordChange({
            op: 'delete',
            relation: {
                namespace: this.#namespace,
                name: this.#name,
                keyColumns: [...this.#schema.keyColumns]
            },
            old: oldRow
        });

        return oldRow;
    }

    async truncate() {
        const affected = [];

        for (const [pk] of this.#rows) {
            const visible = this.#getVisibleVersion(this.#rows, pk);
            if (!visible) continue;

            const fKRulesResult = this.#runReverseFKRoutines('delete', visible, false);
            for (const fn of fKRulesResult.handlers) await fn();
            if (fKRulesResult.hasDeferred) {
                this.#tx.addFinallizer(() => {
                    this.#runReverseFKRoutines('delete', visible, true);
                });
            }

            // --- Track
            // --- This must come first before setting XMAX below
            this.#tx.trackWrite(visible, pk);

            this.#tx.setXMAX(visible, this.#tx.id);

            affected.push({ pk, version: visible });

            this.#tx.recordChange({
                op: 'delete',
                relation: {
                    namespace: this.#namespace,
                    name: this.#name,
                    keyColumns: [...this.#schema.keyColumns]
                },
                old: visible
            });
        }

        this.#tx.addUndo(() => {
            for (const { version } of affected) {
                if (this.#tx.matchXMAX(version, this.#tx.id)) {
                    this.#tx.resetXMAX(version, 0);
                }
            }
        });

        return affected.length;
    }

    // ------------

    vacuum() {
        const oldest = this.#tx.engine.getOldestActiveSnapshot();

        for (const [pk, chain] of this.#rows) {
            chainIteration: for (let i = chain.length - 1; i >= 0; i--) {
                const v = chain[i];
                if (v.XMAX === 0) continue;

                // if not 0, v.XMAX CAN BE an array
                // on transactions with strategy === FirstCommitterWins
                for (const xmax of [].concat(v.XMAX)) {
                    const meta = this.#tx.engine.txMeta(xmax);

                    if (!meta || meta.state !== 'committed') continue chainIteration;

                    if (meta.commitTime < oldest) {
                        this.removeFromIndexes(this.#schema.indexes, v);
                        chain.splice(i, 1);
                        continue chainIteration;
                    }
                }
            }

            if (!chain.length) this.#rows.delete(pk);
        }
    }
}
