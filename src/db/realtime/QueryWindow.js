import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ExprEngine } from "../local/ExprEngine.js";
import { _eq } from "../../lang/util.js";

export class QueryWindow extends SimpleEmitter {

    #driver;
    get driver() { return this.#driver; }

    #parentWindow;
    get generator() { return this.#parentWindow; }

    #generatorDisconnect;

    #filters;
    get filters() { return this.#filters; }

    #headlessSelectItems;
    #headlessWhereExpr;

    #query;
    #options;
    #fromEngine;
    #exprEngine;

    #isSingleTable;
    #isWindowedQuery;

    #localRecords;

    constructor(driver, query, filters, options = {}) {
        super();
        this.#driver = driver;
        this.#query = query;
        this.resetFilters(filters);
        this.#options = options;

        this.#isSingleTable = this.#fromEngine.aliasesToTable.size === 1;
        this.#isWindowedQuery = false;

        this.#exprEngine = new ExprEngine(this.#options);

        // Dissect query
        const [byAlias, bySchema] = this.constructor.extractTableNames(this.#query);
        // Pre-compute the "headles query"'s head
        this.#headlessSelectItems = aliases.map((alias) => {
            const aliasSchema = this.#fromEngine.aliasesToTable.get(alias);
            const fnName = this.#driver.dialect === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT';
            const fnArgs = aliasSchema.columns.reduce((build, columnName) => ([
                ...build,
                { nodeName: 'STRING_LITERAL', value: columnName },
                { nodeName: 'COLUMN_REF1', value: columnName, qualifier: { nodeName: 'TABLE_REF1', value: alias } },
            ]), []);
            return {
                nodeName: 'SELECT_ITEM',
                alias: { nodeName: 'BASIC_ALIAS', value: alias },
                expr: { nodeName: 'CALL_EXPR', name: fnName, arguments: fnArgs },
            };
        });

        // Subscribe tables
        this.#generatorDisconnect = this.#driver.subscribe(bySchema, (events) => this.#handleEvents(events));
    }

    inherit(parentWindow) {
        this.#parentWindow = parentWindow;
        if (this.#generatorDisconnect) {
            this.#generatorDisconnect();
        }
        if (!parentWindow) return;
        this.#generatorDisconnect = parentWindow.on('data', (outputEvent) => {
            if (outputEvent.type === 'delete') {
                if (this.#localRecords.has(outputEvent.oldHash)) {
                    this.#localDelete(outputEvent.oldHash);
                } else return; // A delete event that mismatches
            } else {
                if (!this.#satisfiesFilters(outputEvent.jointRecord)) {
                    // Handle mismatch...
                    if (outputEvent.type === 'update' && this.#localRecords.has(outputEvent.oldHash)) {
                        // An update that translates to delete
                        this.#localDelete(outputEvent.oldHash);
                        outputEvent = { ...outputEvent, type: 'delete' };
                    } else return; // An update|insert eventthat mismatches
                }
                if (outputEvent.type === 'update' && !this.#localRecords.has(outputEvent.oldHash)) {
                    // An update that translates to insert
                    this.#localSet(outputEvent.newHash, outputEvent.jointRecord);
                    outputEvent = { ...outputEvent, type: 'insert' };
                }
            }
            this.#fanout(outputEvent);
        });
    }

    // --------------------------

    matchBase(query) {
        const clauses_a = new Set(Object.keys(this.#query));
        const clauses_b = new Set(Object.keys(query));
        clauses_a.delete('where_clause');
        clauses_b.delete('where_clause');
        if (clauses_a.size !== clauses_b.size) {
            // Clauses mismatch
            return false;
        }
        // Match all other clauses
        for (const clauseName of new Set([...clauses_a, ...clauses_b])) {
            if (!clauses_a.has(clauseName) || !clauses_b.has(clauseName)) {
                // Clauses mismatch
                return false;
            }
            if (clauseName === 'select_list') {
                // This is handled separately
                continue;
            }
            if (clauseName === 'having_clause') {
                const filters_a = QueryWindow.splitLogic(this.#query[clauseName].expr);
                const filters_b = QueryWindow.splitLogic(query[clauseName].expr);
                if (matchFilters(filters_a, filters_b)?.size !== 0) {
                    // Clauses mismatch
                    return false;
                }
            } else {
                if (!_eq(this.#query[clauseName], query[clauseName])) {
                    // Clauses mismatch
                    return false;
                }
            }
        }
        return true;
    }

    matchProjection(selectList) {
        const selectItems_a = this.#query.select_list?.entries || [];
        const selectItems_b = selectList?.entries || [];
        if (selectItems_b.length !== selectItems_a.length) {
            // Projection mismatch
            return false;
        }
        for (let i = 0; i < selectItems_a.length; i++) {
            if (!_eq(selectItems_a[1].alias, selectItems_b[1].alias)
                || !matchExprs(selectItems_a[1].expr, selectItems_b[1].expr)) {
                // Projection mismatch
                return false;
            }
        }
        return true;
    }

    matchFilters(filters) {
        return matchFilters(this.#filters, filters);
    }

    resetFilters(newFilters) {
        this.#filters = newFilters;
        this.#headlessWhereExpr = newFilters.reduce((left, right) => {
            return { nodeName: 'BINARY_EXPR', left, operator: 'AND', right };
        }, newFilters.shift());
    }

    #satisfiesFilters(jointRecord) {
        for (const expr of this.#filters) {
            if (!this.#exprEngine.evaluate(expr, jointRecord)) return false;
        }
        return true;
    }

    // --------------------------

    async initialResult() {
        const format = 2, hashes = [];
        const currentRecords = await this.currentRecords();
        const records = format === 2 ? {} : [];
        for (const [hash, jointRecord] of currentRecords.entries()) {
            const projection = this.#renderJointRecord(jointRecord);
            if (format === 2) {
                records[hash] = projection;
            } else {
                records.push(projection);
                hashes.push(hash);
            }
        }
        if (format === 2) {
            return records
        }
        return [records, hashes];
    }

    async currentRecords() {
        const mode = this.#options.mode;
        // Try reuse...
        if (this.#localRecords && mode === 2) {
            return new Map(this.#localRecords);
        }
        let resultJointRecords;
        // Inherit or run fresh...
        if (this.#parentWindow) {
            resultJointRecords = await this.#parentWindow.currentRecords();
            for (const [jointId, jointRecord] of resultJointRecords.entries()) {
                if (!this.#satisfiesFilters(jointRecord)) {
                    resultJointRecords.delete(jointId);
                    continue;
                }
            }
        } else {
            resultJointRecords = await this.#queryHeadless();
        }
        // renderProjection? This is first time call
        if (!this.#localRecords) {
            this.#localRecords = new Map;
            for (const [jointId, jointRecord] of resultJointRecords) {
                this.#localSet(jointId, jointRecord);
            }
        }
        return resultJointRecords;
    }

    async #queryHeadless(extraFilters = [], jointIdCreateCallback = null) {
        const aliases = [...this.#fromEngine.aliasesToTable.keys()];

        // Record ID create util
        if (!jointIdCreateCallback) {
            jointIdCreateCallback = (jointRecord) => {
                const newKeysList = aliases.map((alias) => {
                    const aliasSchema = this.#fromEngine.aliasesToTable.get(alias);
                    const _newKeys = aliasSchema.keyColumns.map((k) => jointRecord[alias][k]);
                    if (_newKeys.every((s) => s === null)) {
                        return null; // IMPORTANT
                    }
                    return _newKeys;
                });
                const jointId = this.#keysToJointId(newKeysList);
                return [jointId/* oldKeys */, null];
            };
        }

        // Compose WHERE
        const _extraFilters = extraFilters.slice(0);
        const whereExpr = _extraFilters.reduce((left, right) => {
            return { nodeName: 'BINARY_EXPR', left, operator: 'AND', right };
        }, this.#headlessWhereExpr || _extraFilters.shift());
        // Final headless query
        const query = {
            ...this.#query,
            select_list: { entries: this.#headlessSelectItems },
            where_clause: whereExpr ? {
                nodeName: 'WHERE_CLAUSE',
                expr: whereExpr,
            } : undefined,
        };

        // The fetch
        const result = await this.#driver.query(query);

        // Map to joint IDs
        const resultMap = new Map;
        for (const jointRecord of result) {
            const [oldHash, newHash] = jointIdCreateCallback(jointRecord);
            resultMap.set(oldHash, jointRecord);
            if (newHash) {
                jointRecord[Symbol.for('newHash')] = newHash;
            }
        }

        return resultMap;
    }

    #keysToJointId(keyValues) {
        return JSON.stringify(keyValues);
    }

    #keysFromJointId(jointId) {
        return JSON.parse(jointId);
    }

    #localSet(jointId, jointRecord) {
        this.#localRecords.set(jointId, this.#deriveLocalCopy(jointRecord));
    }

    #localDelete(jointId) {
        this.#localRecords.delete(jointId);
    }

    #localReindex(idChanges) {
        if (!idChanges.size) return;
        this.#localRecords = new Map([...this.#localRecords.entries()].map(([id, jointRecord]) => {
            if (idChanges.has(id)) id = idChanges.get(id);
            return [id, jointRecord];
        }));
    }

    #deriveLocalCopy(jointRecord) {
        const mode = this.#options.mode;
        return mode === 2
            ? jointRecord
            : Object.fromEntries(Object.keys(jointRecord).map((alias) => {
                const aliasSchema = this.#fromEngine.aliasesToTable.get(alias);
                const rowObj = Object.fromEntries(aliasSchema.keyColumns.map((k) => [k, jointRecord[alias][k]]));
                return [alias, rowObj];
            }));
    }

    #renderJointRecord(jointRecord) {
        const projection = {};
        for (const selectItem of this.#query.select_list.entries) {
            const alias_cs = selectItem.alias.delim
                ? selectItem.alias.value
                : selectItem.alias.value.toLowerCase();
            const value = this.#exprEngine.evaluate(selectItem.expr, jointRecord);
            projection[alias_cs] = value;
        }
        return projection;
    }

    // --------------------------

    #normalizeEvents(events) {
        // Normalize oldKeys stuff
        const normalizedEvents = events.filter((e) => e.type === 'insert' || e.type === 'update' || e.type === 'delete').map((e) => {
            const relationHash = JSON.stringify([e.relation.schema, e.relation.name]);
            const affectedAliases = [...this.#fromEngine.aliasesToTable.values()].map((aliasSchema) => aliasSchema.hash === relationHash);
            const keyColumns = e.relation.keyColumns;
            const oldKeys = e.key
                ? Object.values(e.key)
                : keyColumns.map((k) => e.new[k]);
            const newKeys = e.new
                ? keyColumns.map((k) => e.new[k])
                : oldKeys.slice(0);
            return { ...e, keyColumns, oldKeys, newKeys, relationHash, affectedAliases };
        });
        // 2. Normalize sequences and gather some intelligence stuff
        const normalizedEventsMap = new Map;
        const keyHistoryMap = new Map;
        for (const normalizedEvent of normalizedEvents) {
            const keyHash_old = this.#keysToJointId(normalizedEvent.oldKeys);
            let previous, keyHash_new;
            if (previous = normalizedEventsMap.get(keyHash_old)) {
                if (previous.type === 'insert' && normalizedEvent.type === 'delete') {
                    // Ignore; inconsequential
                    continue;
                }
                if (previous.type === 'delete' && normalizedEvent.type === 'insert') {
                    // Treat as update should in case props were changed before reinsertion
                    normalizedEventsMap.set(keyHash_old, { ...normalizedEvent, type: 'update', old: previous.old });
                    continue;
                }
                if (previous.type === 'insert' && normalizedEvent.type === 'update') {
                    // Use the lastest state of said record, but as an insert
                    normalizedEventsMap.set(keyHash_old, { ...normalizedEvent, type: 'insert' });
                    continue;
                }
                if (previous.type === 'update' && normalizedEvent.type === 'delete') {
                    // Honur latest event using same ID
                    normalizedEventsMap.delete(keyHash_old); // Don't retain old slot
                    keyHistoryMap.get(normalizedEvent.relationHash)?.delete(keyHash_old); // Forget about any key transition in previous
                    // Flow down normally
                }
            } else if (normalizedEvent.type === 'update' && (previous = keyHistoryMap.get(normalizedEvent.relationHash)?.get(keyHash_old)?.normalizedEvent)) {
                const _normalizedEvent = { ...normalizedEvent, oldKeys: previous.oldKeys, old: previous.old }; // Honour latest, but mapped to old keys
                normalizedEventsMap.delete(keyHash_old); // Don't retain old slot; must come first
                normalizedEventsMap.set(keyHash_old, _normalizedEvent);
                // Do history stuff
                if ((keyHash_new = this.#keysToJointId(_normalizedEvent.newKeys)) !== keyHash_old) {
                    if (!keyHistoryMap.has(normalizedEvent.relationHash)) {
                        keyHistoryMap.set(normalizedEvent.relationHash, new Map);
                    }
                    keyHistoryMap.get(normalizedEvent.relationHash).set(keyHash_new, { keyHash_old: keyHistoryMap.get(normalizedEvent.relationHash).get(keyHash_old).keyHash_old/* original keyHash_old */, normalizedEvent: _normalizedEvent });
                    keyHistoryMap.get(normalizedEvent.relationHash).delete(keyHash_old); // Forget previous history; must come only after
                }
                continue;
            } else if (normalizedEvent.type === 'update' && (keyHash_new = this.#keysToJointId(normalizedEvent.newKeys)) !== keyHash_old) {
                if (!keyHistoryMap.has(normalizedEvent.relationHash)) {
                    keyHistoryMap.set(normalizedEvent.relationHash, new Map);
                }
                keyHistoryMap.get(normalizedEvent.relationHash).set(keyHash_new, { keyHash_old, normalizedEvent });
                // Flow down normally
            }
            normalizedEventsMap.set(keyHash_old, normalizedEvent);
        }
        // 3. For updates that include primary changes
        // we'll need to derive oldJointIds from keyHistoryMap
        let jointIdCreateCallback = null;
        if (keyHistoryMap.size) {
            const aliases = [...this.#fromEngine.aliasesToTable.keys()];
            jointIdCreateCallback = (jointRecord) => {
                const [oldKeysList, newKeysList] = aliases.reduce(([o, n], alias) => {
                    const aliasSchema = this.#fromEngine.aliasesToTable.get(alias);
                    const relationHash = aliasSchema.hash;
                    const keyColumns = aliasSchema.keyColumns;
                    let _newKeys = keyColumns.map((k) => jointRecord[alias][k]);
                    if (_newKeys.every((s) => s === null)) {
                        _newKeys = null; // null: IMPORTANT
                    }
                    const _newKeys_str = this.#keysToJointId(_newKeys);
                    let _oldKeys;
                    if (_newKeys && keyHistoryMap.get(relationHash)?.has(_newKeys_str)) {
                        _oldKeys = keyHistoryMap.get(relationHash).get(_newKeys_str).normalizedEvent.oldKeys;
                    } else {
                        _oldKeys = _newKeys;
                    }
                    return [[...o, _oldKeys], [...n, _newKeys]];
                }, [[], []]);
                const oldHash = this.#keysToJointId(oldKeysList);
                const newHash = this.#keysToJointId(newKeysList);
                return [oldHash, newHash];
            };
        }
        return [normalizedEventsMap, jointIdCreateCallback];
    }

    async #handleEvents(events) {
        const [
            normalizedEventsMap,
            jointIdCreateCallback,
        ] = this.#normalizeEvents(events);
        if (this.#isSingleTable) {
            this.#handleEvents_SingleTable(normalizedEventsMap);
        } else if (!this.#isWindowedQuery) {
            this.#handleEvents_MultiTable_Incremental(normalizedEventsMap, jointIdCreateCallback);
        } else {
            this.#handleEvents_MultiTable_Wholistic(jointIdCreateCallback);
        }
    }

    async #handleEvents_SingleTable(normalizedEventsMap) {
        const idChanges = new Map;
        e: for (const normalizedEvent of normalizedEventsMap.values()) {
            switch (normalizedEvent.type) {
                case 'insert':
                    const jointId_1 = this.#keysToJointId([normalizedEvent.newKeys]);
                    const jointRecord_1 = { [normalizedEvent.affectedAliases[0]]: normalizedEvent.new };
                    if (!this.#satisfiesFilters(jointRecord_1)) {
                        continue e;
                    }
                    this.#localSet(jointId_1, jointRecord_1);
                    this.#fanout({ type: 'insert', newHash: jointId_1, jointRecord: jointRecord_1 });
                    break;
                case 'update':
                    const jointId_2 = this.#keysToJointId([normalizedEvent.oldKeys]);
                    if (!this.#localRecords.has(jointId_2)) {
                        continue e;
                    }
                    const jointRecord_2 = { [normalizedEvent.affectedAliases[0]]: normalizedEvent.new };
                    this.#localSet(jointId_2, jointRecord_2);
                    const jointId_3 = this.#keysToJointId([normalizedEvent.newKeys]);
                    if (jointId_3 !== jointId_2) {
                        idChanges.set(jointId_2, jointId_3);
                    }
                    this.#fanout({ type: 'update', oldHash: jointId_2, newHash: jointId_3, jointRecord: jointRecord_2 });
                    break;
                case 'delete':
                    const jointId_4 = this.#keysToJointId([normalizedEvent.oldKeys]);
                    if (!this.#localRecords.has(jointId_4)) {
                        continue e;
                    }
                    this.#localDelete(jointId_2);
                    this.#fanout({ type: 'delete', oldHash: jointId_4 });
                    break;
            }
        }
        this.#localReindex(idChanges);
    }

    async #handleEvents_MultiTable_Incremental(normalizedEventsMap, jointIdCreateCallback) {
        const composeDiffingPredicate = (alias, keyColumns, keyValues, nullTest = 0) => {
            // Handle multi-key PKs
            if (keyColumns.length > 1) {
                const operands = keyColumns.map((keyColumn, i) => composeDiffingPredicate(alias, [keyColumn], [keyValues[i]], nullTest));
                return operands.reduce((left, right) => ({
                    nodeName: 'BINARY_EXPR',
                    left,
                    operator: 'AND',
                    right,
                }), operands.shift());
            }
            // Compose...
            const columnRef = { nodeName: 'COLUMN_REF1', value: keyColumns[0], qualifier: { nodeName: 'TABLE_REF1', value: alias } };
            // Compose: <keyColumn> IS NULL
            const nullLiteral = { nodeName: 'NULL_LITERAL', value: null };
            const isNullExpr = {
                nodeName: 'BINARY_EXPR',
                left: columnRef,
                operator: 'IS',
                right: nullLiteral,
            };
            if (nullTest === 1) {
                return isNullExpr;
            }
            // Compose: <keyColumn> = <keyValue>
            const valueLiteral = { nodeName: typeof keyValues[0] === 'number' ? 'NUMBER_LITERAL' : 'STRING_LITERAL', value: keyValues[0] };
            const eqExpr = {
                nodeName: 'BINARY_EXPR',
                left: columnRef,
                operator: '=',
                right: valueLiteral
            };
            // Compose?: (<keyColumn> IS NULL OR <keyColumn> = <keyValue>)
            if (nullTest === 2) {
                const orExpr = {
                    nodeName: 'BINARY_EXPR',
                    left: isNullExpr,
                    operator: 'OR',
                    right: eqExpr,
                };
                return { nodeName: 'ROW_CONSTRUCTOR', entries: [orExpr] };
            }
            return eqExpr;
        };
        // Do partial diffing!
        const localRecords = new Map;
        for (const normalizedEvent of normalizedEventsMap.values()) {
            let diffingFilters = [];
            const affectedAliases = normalizedEvent.affectedAliases;
            if (normalizedEvent.type === 'insert') {
                // keyColumn === null // keyColumn IN [null, newKey]
                diffingFilters = [
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 1)),
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 2)),
                ];
            }
            if (normalizedEvent.type === 'update') {
                // keyColumn IN [null, oldKey] // keyColumn IN [null, newKey]
                diffingFilters = [
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.oldKeys, 2)),
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 2)),
                ];
            }
            if (normalizedEvent.type === 'delete') {
                // keyColumn = oldKey // keyColumn === null
                diffingFilters = [
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.oldKeys, 0)),
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 1)),
                ];
            }
            row: for (const [jointId, jointRecord] of this.#localRecords.entries()) {
                for (const expr of diffingFilters[0]) {
                    if (!this.#exprEngine.evaluate(expr, jointRecord)) {
                        continue row;
                    }
                }
                localRecords.set(jointId, jointRecord);
            }
        }
        const remoteRecords = await this.#queryHeadless(diffingFilters[1], jointIdCreateCallback);
        this.#diffRecords(localRecords, remoteRecords);
    }

    async #handleEvents_MultiTable_Wholistic(jointIdCreateCallback) {
        const remoteRecords = await this.#queryHeadless([], jointIdCreateCallback);
        this.#diffRecords(this.#localRecords, remoteRecords);
    }

    #diffRecords(localRecords, remoteRecords) {
        const localJointIds = new Set(localRecords.keys());
        const remoteJointIds = new Set(remoteRecords.keys());
        const allJointIds = new Set([
            ...localJointIds,
            ...remoteJointIds
        ]);
        const aliasesLength = this.#fromEngine.aliasesToTable.size;
        // Utils:
        const findPartialMatch = (oldJId) => {
            const oldJId_split = this.#keysFromJointId(oldJId);
            top: for (const newJId of remoteJointIds) {
                const newJId_split = this.#keysFromJointId(newJId);
                let matched = true;
                let nullMatched_o = false;
                let nullMatched_n = false;
                for (let i = 0; i < aliasesLength; i++) {
                    if (oldJId_split[i] === null) {
                        if (nullMatched_o) return; // Multiple slots in old
                        nullMatched_o = true;
                    }
                    if (newJId_split[i] === null) {
                        if (nullMatched_n) continue top; // Multiple slots in new
                        nullMatched_n = true;
                    }
                    matched = matched && (oldJId_split[i] === newJId_split[i] || nullMatched_o || nullMatched_n);
                }
                if (matched) return newJId;
            }
        };
        // The diffing...
        const idChanges = new Map;
        const enittedPartials = new Set;
        for (const jId of allJointIds) {
            if (localJointIds.has(jId)) {
                // Exact match
                if (remoteJointIds.has(jId)) {
                    this.#localSet(jId, remoteRecords.get(jId)); // Replacing any existing
                    remoteJointIds.delete(jId); // IMPORTANT subsequent iterations should not see this anymore; especially when findPartialMatch()
                    this.#fanout({ type: 'update', oldHash: jId, newHash: remoteRecords.get(jId)[Symbol.for('newHash')] || jId, jointRecord: remoteRecords.get(jId) });
                    continue;
                }
                const newJId = findPartialMatch(jId);
                if (newJId && !enittedPartials.has(newJId)/* IMPORTANT */) {
                    // Partial match
                    this.#localSet(jId, remoteRecords.get(jId)); // Replacing any existing
                    remoteJointIds.delete(newJId); // IMPORTANT: subsequent iterations should not see this anymore; especially when findPartialMatch()
                    idChanges.set(jId, newJId);
                    enittedPartials.add(newJId);
                    this.#fanout({ type: 'update', oldHash: jId, newHash: remoteRecords.get(jId)[Symbol.for('newHash')] || jId, jointRecord: remoteRecords.get(newJId) });
                } else {
                    // Obsolete
                    this.#localDelete(jId);
                    this.#fanout({ type: 'delete', oldHash: jId });
                }
            } else if (remoteJointIds.has(jId)) {
                // All new
                this.#localSet(jId, remoteRecords.get(jId)); // Push new
                this.#fanout({ type: 'insert', newHash: jId, jointRecord: remoteRecords.get(jId) });
            }
        }
        this.#localReindex(idChanges);
    }

    #fanout(outputEvent) {
        this.emit('data', outputEvent);
        // Handle deletions
        if (outputEvent.type === 'delete') {
            this.emit('mutation', {
                type: outputEvent.type,
                oldHash: outputEvent.oldHash,
            });
            return;
        }
        // Run projection
        const projection = this.#renderJointRecord(outputEvent.jointRecord);
        // Emit events
        this.emit('mutation', {
            type: outputEvent.type,
            ...(outputEvent.type === 'update' ? { oldHash: outputEvent.oldHash } : {}),
            newHash: outputEvent.newHash,
            new: projection,
        });
    }

    // ------------

    static splitLogic(expr) {
        if (expr.nodeName === 'BINARY_EXPR') {
            if (expr.operator === 'OR') return null;
            if (expr.operator === 'AND') {
                const right = this.splitLogic(expr.right);
                if (!right) return null;
                return [expr.left].concat(right);
            }
        }
        return [expr];
    }

    static extractTableNames(query) {
        const [byAlias, bySchema] = [{}, {}];
        for (const fromItem of query.from_clause.entries.concat(query.join_clauses || [])) {
            // Aliases are expected - except for a FROM (subquery) scenario, where it's optional
            const alias = fromItem.alias?.delim ? fromItem.alias.value : (fromItem.alias?.value.toLowerCase() || '');
            if (fromItem.expr.nodeName === 'TABLE_REF1') {
                // Both name and qualifier are expected
                const tableName = fromItem.expr.delim ? fromItem.expr.value : fromItem.expr.value.toLowerCase();
                const schemaName = fromItem.expr.qualifier.delim ? fromItem.expr.qualifier.value : fromItem.expr.qualifier.value.toLowerCase();
                // Map those...
                byAlias[alias] = new Set([JSON.stringify([schemaName, tableName])]);
                bySchema[schemaName] = [].concat(bySchema[schemaName] || []).concat(tableName);
            } else if (fromItem.expr.nodeName === 'DERIVED_QUERY') {
                const [_byAlias, _bySchema] = this.extractTableNames(fromItem.expr.expr);
                // Flatten, dedupe and map those...
                const _byAlias_flat = Object.values(_byAlias).reduce((all, entries) => ([...all, ...entries]), []);
                byAlias[alias] = new Set(_byAlias_flat);
                for (const [schemaName, tableNames] of Object.entries(_bySchema)) {
                    const tableNames_total = [].concat(bySchema[schemaName] || []).concat(tableNames);
                    bySchema[schemaName] = [...new Set(tableNames_total)];
                }
            } else {
                byAlias[alias] = new Set;
            }
        }
        return [byAlias, bySchema];
    }
}

const matchExprs = (a, b) => {
    if (a.nodeName !== b.nodeName) return false;
    if (a.nodeName === 'BINARY_EXPR') {
        if (a.operator === b.operator
            && ['=', '==', '!=', '<>', 'IS', 'IS NOT', 'DISTINCT FROM'].includes(a.operator)) {
            return _eq(a.left, b.left) && _eq(a.right, b.right)
                || _eq(a.right, b.left) && _eq(a.left, b.right);
        }
        if (a.operator === '<' && b.operator === '>'
            || a.operator === '<=' && b.operator === '>='
            || a.operator === '>' && b.operator === '<'
            || a.operator === '>=' && b.operator === '<=') {
            return _eq(a.right, b.left) && _eq(a.left, b.right);
        }
    }
    return _eq(a, b);
};

const matchFilters = (a, b) => {
    const _filters = new Set(b);
    top: for (const _a of a) {
        for (const _b of b) {
            if (matchExprs(_a, _b)) {
                _filters.delete(_b);
                continue top;
            }
        }
        return null;
    }
    return _filters;
};
