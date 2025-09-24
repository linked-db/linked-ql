import { ExprEngine } from "../local/ExprEngine.js";
import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { BasicSelectStmt } from '../../lang/dql/BasicSelectStmt.js';
import { splitLogicalExpr, matchLogicalExprs, matchExpr } from '../abstracts/util.js';
import { registry } from "../../lang/registry.js";
import { _eq } from "../../lang/abstracts/util.js";

export class QueryWindow extends SimpleEmitter {

    #driver;
    get driver() { return this.#driver; }

    #parentWindow;
    get generator() { return this.#parentWindow; }

    #generatorDisconnect;

    #filters = [];
    get filters() { return this.#filters; }

    #query;
    #queryJson;
    #logicalQueryJson;
    #options;
    #exprEngine;

    #aliases = [];
    #originSchemasLite = new Map;
    #isSingleTable = true;
    #isWindowedQuery = false;
    #specifiedLimit = 0;

    #localRecords = new Map;
    #firstRun = false;

    constructor(driver, query, filters = [], options = {}) {
        super();
        this.#driver = driver;
        if (!(query instanceof BasicSelectStmt)) {
            throw new Error('Only SELECT statements are supported in RealtimeClient');
        }
        if (!Array.isArray(query.originSchemas())) {
            throw new Error('Expected a pre-resolved query object with originSchemas() returning an array');
        }

        this.#query = query;
        this.#queryJson = this.#query.jsonfy({ resultSchemas: false, originSchemas: false });

        this.#options = options;
        this.#exprEngine = new ExprEngine(this.#options);

        // Scan query...
        const [fromItemsByAlias, fromItemsBySchema, meta] = scanQuery(this.#queryJson, true);
        if (meta.hasSubquery) {
            throw new Error(`Subqueries are not yet supported for realtime queries`);
        }

        // Derive schemas...
        const getJson = (node) => {
            const value = node.value();
            const delim = node._get('delim');
            return { value: delim ? value : value.toLowerCase(), delim };
        };
        for (const alias in fromItemsByAlias) {
            const originSchema = this.#query.originSchemas().find((os) => {
                if (os instanceof registry.JSONSchema) return alias === '';
                return os.identifiesAs(alias);
            });
            let $columns,
                $keyColumns,
                usingAllColumnsForKeyColumns = false;
            if (originSchema instanceof registry.JSONSchema) {
                $columns = originSchema.entries().map((e) => getJson(e.name()));
                if (fromItemsByAlias[alias].size > 1 || !($keyColumns = originSchema.entries().filter((e) => e.pkConstraint()).map(getJson)).length) {
                    $keyColumns = structuredClone($columns);
                    usingAllColumnsForKeyColumns = true;
                }
            } else {
                $columns = originSchema.columns().map((e) => getJson(e.name()));
                if (fromItemsByAlias[alias].size > 1 || !($keyColumns = originSchema.pkConstraint(true)?.columns().map(getJson))) {
                    $keyColumns = structuredClone($columns);
                    usingAllColumnsForKeyColumns = true;
                }
            }
            this.#originSchemasLite.set(alias, {
                hashSet: fromItemsByAlias[alias],
                columns: $columns.map((c) => c.value),
                keyColumns: $keyColumns.map((c) => c.value),
                usingAllColumnsForKeyColumns,
                $columns,
                $keyColumns,
            });
            const delim = alias !== alias.toLowerCase()
                || /^\d/.test(alias)
                || !/^(\*|[\w]+)$/.test(alias);
            this.#aliases.push({ value: alias, delim });
        }

        // Quick flags
        this.#isWindowedQuery = meta.hasAggrFunctions;
        this.#isSingleTable = this.#aliases.length === 1 && ((k) => k.length === 1 && fromItemsBySchema[k[0]].length === 1)(Object.keys(fromItemsBySchema));
        this.#specifiedLimit = this.#queryJson.limit_clause?.expr ? this.#exprEngine.evaluate(this.#queryJson.limit_clause?.expr) : 0;

        // Subscribe to WAL events...
        this.#generatorDisconnect = this.#driver.subscribe(fromItemsBySchema, (events) => {
            this.#handleEvents(events).catch((e) => this.emit('error', e));
        });

        // Pre-compute the "headles query"'s head
        const logicalSelectItems = this.#aliases.map((aliasJson) => {
            const originSchema = this.#originSchemasLite.get(aliasJson.value);
            const fnName = this.#driver.dialect === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT';
            const fnArgs = originSchema.$columns.reduce((build, colJson) => ([
                ...build,
                { nodeName: 'STRING_LITERAL', ...colJson },
                { nodeName: 'COLUMN_REF1', ...colJson, qualifier: { nodeName: 'TABLE_REF1', ...aliasJson } },
            ]), []);
            return {
                nodeName: 'SELECT_ITEM',
                alias: { nodeName: 'SELECT_ITEM_ALIAS', ...aliasJson },
                expr: { nodeName: 'CALL_EXPR', name: fnName, arguments: fnArgs },
            };
        });

        // Declare this.#logicalQueryJson
        this.#logicalQueryJson = { ...this.#queryJson, select_list: { entries: logicalSelectItems } };

        // Apply filters to this.#logicalQueryJson
        if (filters.length) {
            this.resetFilters(filters);
        }
    }

    async disconnect() { this.#generatorDisconnect?.(); }

    // --------------------------

    inherit(parentWindow) {
        this.#generatorDisconnect?.();
        if (!parentWindow) return;
        this.#parentWindow = parentWindow;
        this.#generatorDisconnect = parentWindow.on('data', (outputEvent) => {
            if (outputEvent.type === 'delete') {
                if (this.#localRecords.has(outputEvent.oldHash)) {
                    this.#localDelete(outputEvent.oldHash);
                } else return; // A delete event that mismatches
            } else {
                if (!this.#satisfiesFilters(outputEvent.logicalRecord)) {
                    // Handle mismatch...
                    if (outputEvent.type === 'update' && this.#localRecords.has(outputEvent.oldHash)) {
                        // An update that translates to delete
                        this.#localDelete(outputEvent.oldHash);
                        outputEvent = { ...outputEvent, type: 'delete' };
                    } else return; // An update|insert eventthat mismatches
                }
                if (outputEvent.type === 'update' && !this.#localRecords.has(outputEvent.oldHash)) {
                    // An update that translates to insert
                    this.#localSet(outputEvent.newHash, outputEvent.logicalRecord);
                    outputEvent = { ...outputEvent, type: 'insert' };
                }
            }
            this.#fanout(outputEvent);
        });
    }

    // --------------------------

    matchBase(query) {
        const clauses_a = new Set(this.#query._keys());
        const clauses_b = new Set(query._keys());
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
                const filters_a = splitLogicalExpr(this.#query._get(clauseName).expr());
                const filters_b = splitLogicalExpr(query._get(clauseName).expr());
                if (matchLogicalExprs(filters_a, filters_b)?.size !== 0) {
                    // Clauses mismatch
                    return false;
                }
            } else {
                if (!matchExpr(this.#query._get(clauseName), query._get(clauseName))) {
                    // Clauses mismatch
                    return false;
                }
            }
        }
        return true;
    }

    matchProjection(selectList) {
        const selectItems_a = this.#query.selectList().entries();
        const selectItems_b = selectList.entries();
        if (selectItems_b.length !== selectItems_a.length) {
            // Projection mismatch
            return false;
        }
        for (let i = 0; i < selectItems_a.length; i++) {
            if (!matchExpr(selectItems_a[1].alias(), selectItems_b[1].alias())
                || !matchExpr(selectItems_a[1].expr(), selectItems_b[1].expr())) {
                // Projection mismatch
                return false;
            }
        }
        return true;
    }

    matchFilters(filters) {
        return matchLogicalExprs(this.#filters, filters);
    }

    resetFilters(newFilters) {
        this.#filters = newFilters;
        const _newFilters = newFilters.slice(0);
        const headlessWhereExpr = _newFilters.reduce((left, right) => {
            return { nodeName: 'BINARY_EXPR', left: left.jsonfy(), operator: 'AND', right: right.jsonfy() };
        }, _newFilters.shift());
        this.#logicalQueryJson = {
            ...this.#logicalQueryJson,
            where_clause: headlessWhereExpr ? {
                nodeName: 'WHERE_CLAUSE',
                expr: headlessWhereExpr,
            } : undefined,
        };
    }

    #satisfiesFilters(logicalRecord) {
        if (!this.#logicalQueryJson.where_clause) return true;
        return this.#exprEngine.evaluate(this.#logicalQueryJson.where_clause.expr, logicalRecord);
    }

    // --------------------------

    async initialResult() {
        const currentRecords = await this.currentRecords();
        const records = [], hashes = [];
        for (const [logicalHash, logicalRecord] of currentRecords.entries()) {
            const projection = this.#renderLogicalRecord(logicalRecord);
            records.push(projection);
            hashes.push(logicalHash);
        }
        return [records, hashes];
    }

    async currentRecords() {
        const mode = this.#options.mode;
        // Try reuse...
        if (mode === 2 && this.#firstRun) {
            return new Map(this.#localRecords);
        }
        let resultRecords;
        // Inherit or run fresh...
        if (this.#parentWindow) {
            resultRecords = await this.#parentWindow.currentRecords();
            for (const [logicalHash, logicalRecord] of resultRecords.entries()) {
                if (!this.#satisfiesFilters(logicalRecord)) {
                    resultRecords.delete(logicalHash);
                    continue;
                }
            }
        } else {
            resultRecords = await this.#queryHeadless();
        }
        // renderProjection? This is first time call
        if (!this.#firstRun) {
            this.#firstRun = true;
            for (const [logicalHash, logicalRecord] of resultRecords) {
                this.#localSet(logicalHash, logicalRecord);
            }
        }
        return resultRecords;
    }

    async #queryHeadless(extraWhereJson = null, logicalHashCreateCallback = null) {
        // Record ID create util
        if (!logicalHashCreateCallback) {
            logicalHashCreateCallback = (logicalRecord) => {
                const newKeysList = [...this.#originSchemasLite.entries()].map(([alias, originSchema]) => {
                    const _newKeys = originSchema.keyColumns.map((k) => logicalRecord[alias][k]);
                    if (_newKeys.every((s) => s === null)) {
                        return null; // IMPORTANT
                    }
                    return _newKeys;
                });
                const logicalHash = this.#keysToLogicalHash(newKeysList);
                return [logicalHash/* oldKeys */, logicalHash/* newKeys */];
            };
        }
        // Finalize logicalQueryJson
        let logicalQueryJson = this.#logicalQueryJson;
        if (extraWhereJson) {
            const finalWhereJson = logicalQueryJson.where_clause?.expr
                ? { nodeName: 'BINARY_EXPR', left: extraWhereJson, operator: 'AND', right: logicalQueryJson.where_clause.expr }
                : extraWhereJson;
            logicalQueryJson = {
                ...logicalQueryJson,
                where_clause: { nodeName: 'WHERE_CLAUSE', expr: finalWhereJson },
            };
        }
        // The fetch
        const logicalQuery = this.#query.constructor.fromJSON(logicalQueryJson, { dialect: this.#driver.dialect });
        const result = await this.#driver.query(logicalQuery);
        // Map to joint IDs
        const resultMap = new Map;
        for (const logicalRecord of result.rows) {
            const [oldHash, newHash] = logicalHashCreateCallback(logicalRecord);
            logicalRecord[Symbol.for('newHash')] = newHash;
            resultMap.set(oldHash, logicalRecord);
        }
        return resultMap;
    }

    #keysToLogicalHash(keyValues) {
        return JSON.stringify(keyValues);
    }

    #keysFromLogicalHash(logicalHash) {
        return JSON.parse(logicalHash);
    }

    #localSet(logicalHash, logicalRecord) {
        this.#localRecords.set(logicalHash, this.#deriveLocalCopy(logicalRecord));
    }

    #localDelete(logicalHash) {
        this.#localRecords.delete(logicalHash);
    }

    #localReindex(idChanges) {
        if (!idChanges.size) return;
        this.#localRecords = new Map([...this.#localRecords.entries()].map(([id, logicalRecord]) => {
            if (idChanges.has(id)) id = idChanges.get(id);
            return [id, logicalRecord];
        }));
    }

    #deriveLocalCopy(logicalRecord) {
        const mode = this.#options.mode;
        return mode === 2
            ? logicalRecord
            : Object.fromEntries([...this.#originSchemasLite.entries()].map(([alias, originSchema]) => {
                const rowObj = Object.fromEntries(originSchema.keyColumns.map((k) => [k, logicalRecord[alias][k]]));
                return [alias, rowObj];
            }));
    }

    #renderLogicalRecord(logicalRecord) {
        const projection = {};
        for (const selectItemJson of this.#queryJson.select_list.entries) {
            const alias = selectItemJson.alias?.value || '?column?';
            const value = this.#exprEngine.evaluate(selectItemJson.expr, logicalRecord);
            projection[alias] = value;
        }
        return projection;
    }

    // --------------------------

    #normalizeEvents(events) {
        // Normalize oldKeys stuff
        let usingAllColumnsForKeyColumns_found;
        const normalizedEvents = events.filter((e) => e.type === 'insert' || e.type === 'update' || e.type === 'delete').map((e) => {
            const relationHash = JSON.stringify([e.relation.schema, e.relation.name]);

            const affectedAliasesEntries = [...this.#originSchemasLite.entries()].filter(([, originSchema]) => originSchema.hashSet.has(relationHash));
            const affectedAliases = affectedAliasesEntries.map(([alias]) => alias);
            if (affectedAliasesEntries.find(([, originSchema]) => originSchema.usingAllColumnsForKeyColumns)) {
                usingAllColumnsForKeyColumns_found = true;
            }

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
            const keyHash_old = this.#keysToLogicalHash(normalizedEvent.oldKeys);
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
                if ((keyHash_new = this.#keysToLogicalHash(_normalizedEvent.newKeys)) !== keyHash_old) {
                    if (!keyHistoryMap.has(normalizedEvent.relationHash)) {
                        keyHistoryMap.set(normalizedEvent.relationHash, new Map);
                    }
                    keyHistoryMap.get(normalizedEvent.relationHash).set(keyHash_new, { keyHash_old: keyHistoryMap.get(normalizedEvent.relationHash).get(keyHash_old).keyHash_old/* original keyHash_old */, normalizedEvent: _normalizedEvent });
                    keyHistoryMap.get(normalizedEvent.relationHash).delete(keyHash_old); // Forget previous history; must come only after
                }
                continue;
            } else if (normalizedEvent.type === 'update' && (keyHash_new = this.#keysToLogicalHash(normalizedEvent.newKeys)) !== keyHash_old) {
                if (!keyHistoryMap.has(normalizedEvent.relationHash)) {
                    keyHistoryMap.set(normalizedEvent.relationHash, new Map);
                }
                keyHistoryMap.get(normalizedEvent.relationHash).set(keyHash_new, { keyHash_old, normalizedEvent });
                // Flow down normally
            }
            normalizedEventsMap.set(keyHash_old, normalizedEvent);
        }
        // 3. For updates that include primary changes
        // we'll need to derive oldLogicalHashs from keyHistoryMap
        let logicalHashCreateCallback = null;
        if (keyHistoryMap.size) {
            logicalHashCreateCallback = (logicalRecord) => {
                const [oldKeysList, newKeysList] = [...this.#originSchemasLite.entries()].reduce(([o, n], [alias, originSchema]) => {
                    const relationHash = originSchema.hashSet.size === 1
                        ? [...originSchema.hashSet][0]
                        : null;
                    const keyColumns = originSchema.keyColumns;
                    let _newKeys = keyColumns.map((k) => logicalRecord[alias][k]);
                    if (_newKeys.every((s) => s === null)) {
                        _newKeys = null; // null: IMPORTANT
                    }
                    const _newKeys_str = this.#keysToLogicalHash(_newKeys);
                    let _oldKeys;
                    if (_newKeys && keyHistoryMap.get(relationHash)?.has(_newKeys_str)) {
                        _oldKeys = keyHistoryMap.get(relationHash).get(_newKeys_str).normalizedEvent.oldKeys;
                    } else {
                        _oldKeys = _newKeys;
                    }
                    return [[...o, _oldKeys], [...n, _newKeys]];
                }, [[], []]);
                const oldHash = this.#keysToLogicalHash(oldKeysList);
                const newHash = this.#keysToLogicalHash(newKeysList);
                return [oldHash, newHash];
            };
        }
        return [normalizedEventsMap, logicalHashCreateCallback, usingAllColumnsForKeyColumns_found];
    }

    async #handleEvents(events) {
        const [
            normalizedEventsMap,
            logicalHashCreateCallback,
            usingAllColumnsForKeyColumns_found,
        ] = this.#normalizeEvents(events);
        if (this.#isSingleTable && !this.#isWindowedQuery) {
            // Only windowing NOT supported; offsets / limit supported
            await this.#handleEvents_SingleTable(normalizedEventsMap);
        } else if (!this.#isWindowedQuery && !usingAllColumnsForKeyColumns_found && !this.#queryJson.limit_clause && !this.#queryJson.offset_clause) {
            // NONE of windowing / offsets / limit supported; plus usingAllColumnsForKeyColumns_found NOT supported
            await this.#handleEvents_MultiTable_Incremental(normalizedEventsMap, logicalHashCreateCallback);
        } else {
            await this.#handleEvents_Wholistic(logicalHashCreateCallback);
        }
    }

    async #handleEvents_SingleTable(normalizedEventsMap) {
        const idChanges = new Map;
        const deferredInserts = new Set;
        e: for (const normalizedEvent of normalizedEventsMap.values()) {
            switch (normalizedEvent.type) {
                case 'insert':
                    if (this.#specifiedLimit && this.#localRecords.size === this.#specifiedLimit) {
                        // Defere INSERTs
                        deferredInserts.add(normalizedEvent);
                        continue e;
                    }
                    const logicalHash_1 = this.#keysToLogicalHash([normalizedEvent.newKeys]);
                    const jointRecord_1 = { [normalizedEvent.affectedAliases[0]]: normalizedEvent.new };
                    if (!this.#satisfiesFilters(jointRecord_1)) {
                        continue e;
                    }
                    this.#localSet(logicalHash_1, jointRecord_1);
                    this.#fanout({ type: 'insert', newHash: logicalHash_1, logicalRecord: jointRecord_1 });
                    break;
                case 'update':
                    const logicalHash_2 = this.#keysToLogicalHash([normalizedEvent.oldKeys]);
                    if (!this.#localRecords.has(logicalHash_2)) {
                        continue e;
                    }
                    const jointRecord_2 = { [normalizedEvent.affectedAliases[0]]: normalizedEvent.new };
                    this.#localSet(logicalHash_2, jointRecord_2);
                    const logicalHash_3 = this.#keysToLogicalHash([normalizedEvent.newKeys]);
                    if (logicalHash_3 !== logicalHash_2) {
                        idChanges.set(logicalHash_2, logicalHash_3);
                    }
                    this.#fanout({ type: 'update', oldHash: logicalHash_2, newHash: logicalHash_3, logicalRecord: jointRecord_2 });
                    break;
                case 'delete':
                    const logicalHash_4 = this.#keysToLogicalHash([normalizedEvent.oldKeys]);
                    if (!this.#localRecords.has(logicalHash_4)) {
                        continue e;
                    }
                    this.#localDelete(logicalHash_2);
                    this.#fanout({ type: 'delete', oldHash: logicalHash_4 });
                    break;
            }
        }
        this.#localReindex(idChanges);
        // Re-attempt INSERTs
        if (deferredInserts.size && this.#localRecords.size < this.#specifiedLimit) {
            this.#handleEvents_SingleTable(deferredInserts);
        }
    }

    async #handleEvents_MultiTable_Incremental(normalizedEventsMap, logicalHashCreateCallback) {
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
            const nullLiteral = { nodeName: 'NULL_LITERAL', value: 'NULL' };
            const isNullExpr = {
                nodeName: 'BINARY_EXPR',
                left: columnRef,
                operator: 'IS',
                right: nullLiteral,
            };
            if (nullTest === 0) {
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
        const remoteDiffingFilters = [];
        for (const normalizedEvent of normalizedEventsMap.values()) {
            let diffingFilters = [];
            const affectedAliases = normalizedEvent.affectedAliases;
            if (normalizedEvent.type === 'insert') {
                // keyColumn === null // keyColumn = newKey
                diffingFilters = [
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.oldKeys, 0)),
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 1)),
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
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.oldKeys, 1)),
                    affectedAliases.map((alias) => composeDiffingPredicate(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 0)),
                ];
            }
            row: for (const [logicalHash, logicalRecord] of this.#localRecords.entries()) {
                for (const expr of diffingFilters[0]) {
                    if (!this.#exprEngine.evaluate(expr, logicalRecord)) {
                        continue row;
                    }
                }
                // All of diffingFilters[0] matched - AND
                localRecords.set(logicalHash, logicalRecord);
            }
            // Build this event's diffingFilters
            const diffingFilters_currentEvent = diffingFilters[1].reduce((left, right) => {
                return { nodeName: 'BINARY_EXPR', left, operator: 'AND', right };
            }, diffingFilters[1].shift());
            remoteDiffingFilters.push(diffingFilters_currentEvent);
        }
        // Build all event's diffingFilters
        let diffingFilters_allEvents;
        if (remoteDiffingFilters.length > 1) {
            const _diffingFilters_allEvents = remoteDiffingFilters.reduce((left, right) => {
                return { nodeName: 'BINARY_EXPR', left, operator: 'OR', right };
            }, remoteDiffingFilters.shift());
            diffingFilters_allEvents = {
                nodeName: 'ROW_CONSTRUCTOR',
                entries: [_diffingFilters_allEvents],
            };
        } else {
            diffingFilters_allEvents = remoteDiffingFilters[0];
        }
        const remoteRecords = await this.#queryHeadless(diffingFilters_allEvents, logicalHashCreateCallback);
        this.#diffRecords(localRecords, remoteRecords);
    }

    async #handleEvents_Wholistic(logicalHashCreateCallback) {
        const remoteRecords = await this.#queryHeadless(null, logicalHashCreateCallback);
        this.#diffRecords(this.#localRecords, remoteRecords);
    }

    #diffRecords(localRecords, remoteRecords) {
        const localLogicalHashs = new Set(localRecords.keys());
        const remoteLogicalHashs = new Set(remoteRecords.keys());
        const allLogicalHashs = new Set([
            ...localLogicalHashs,
            ...remoteLogicalHashs
        ]);
        // Utils:
        const aliasesLength = this.#originSchemasLite.size;
        const findPartialMatch = (oldJId) => {
            const oldJId_split = this.#keysFromLogicalHash(oldJId);
            top: for (const remoteJid of remoteLogicalHashs) {
                const remoteJid_split = this.#keysFromLogicalHash(remoteJid);
                let matched = true;
                let nullMatched_o = false;
                let nullMatched_n = false;
                for (let i = 0; i < aliasesLength; i++) {
                    if (oldJId_split[i] === null) {
                        if (nullMatched_o) return; // Multiple slots in old
                        nullMatched_o = true;
                    }
                    if (remoteJid_split[i] === null) {
                        if (nullMatched_n) continue top; // Multiple slots in new
                        nullMatched_n = true;
                    }
                    matched = matched && (_eq(oldJId_split[i], remoteJid_split[i]) || nullMatched_o || nullMatched_n);
                }
                if (matched) return remoteJid;
            }
        };
        // The diffing...
        const idChanges = new Map;
        const enittedPartials = new Set;
        for (const jId of allLogicalHashs) {
            if (localLogicalHashs.has(jId)) {
                // Exact match
                if (remoteLogicalHashs.has(jId)) {
                    this.#localSet(jId, remoteRecords.get(jId)); // Replacing any existing
                    remoteLogicalHashs.delete(jId); // IMPORTANT subsequent iterations should not see this anymore; especially when findPartialMatch()
                    this.#fanout({ type: 'update', oldHash: jId, newHash: remoteRecords.get(jId)[Symbol.for('newHash')] || jId, logicalRecord: remoteRecords.get(jId) });
                    continue;
                }
                const remoteJid = findPartialMatch(jId);
                if (remoteJid && !enittedPartials.has(remoteJid)/* IMPORTANT */) {
                    // Partial match
                    this.#localSet(jId, remoteRecords.get(remoteJid)); // Replacing any existing
                    remoteLogicalHashs.delete(remoteJid); // IMPORTANT: subsequent iterations should not see this anymore; especially when findPartialMatch()
                    enittedPartials.add(remoteJid);
                    const remoteNewJId = remoteRecords.get(remoteJid)[Symbol.for('newHash')] || remoteJid;
                    idChanges.set(jId, remoteNewJId);
                    this.#fanout({ type: 'update', oldHash: jId, newHash: remoteNewJId, logicalRecord: remoteRecords.get(remoteJid) });
                } else {
                    // Obsolete
                    this.#localDelete(jId);
                    this.#fanout({ type: 'delete', oldHash: jId });
                }
            } else if (remoteLogicalHashs.has(jId)) {
                // All new
                this.#localSet(jId, remoteRecords.get(jId)); // Push new
                this.#fanout({ type: 'insert', newHash: jId, logicalRecord: remoteRecords.get(jId) });
            }
        }
        this.#localReindex(idChanges);
    }

    #fanout(outputEvent) {
        this.emit('data', outputEvent);
        // Handle deletions
        if (outputEvent.type === 'delete') {
            const mutationEvent = {
                type: outputEvent.type,
                oldHash: outputEvent.oldHash,
                old: outputEvent.old,
            };
            this.emit('mutation', mutationEvent);
            return;
        }
        // Run projection
        const projection = this.#renderLogicalRecord(outputEvent.logicalRecord);
        // Emit events
        const mutationEvent = {
            type: outputEvent.type,
            ...(outputEvent.type === 'update' ? { oldHash: outputEvent.oldHash, old: outputEvent.old } : {}),
            newHash: outputEvent.newHash,
            new: projection,
        };
        this.emit('mutation', mutationEvent);
    }
}

export function scanQuery(queryJson, withMeta = false) {
    const [fromItemsByAlias, fromItemsBySchema, meta] = [{}, {}, {}];
    for (const fromItem of queryJson.from_clause.entries.concat(queryJson.join_clauses || [])) {
        // Aliases are expected - except for a FROM (subquery) scenario, where it's optional
        const alias = fromItem.alias?.delim ? fromItem.alias.value : (fromItem.alias?.value.toLowerCase() || '');
        if (fromItem.expr.nodeName === 'TABLE_REF1' && fromItem.expr.resolution === 'default') {
            // Both name and qualifier are expected
            const tableName = fromItem.expr.delim ? fromItem.expr.value : fromItem.expr.value.toLowerCase();
            const schemaName = fromItem.expr.qualifier.delim ? fromItem.expr.qualifier.value : fromItem.expr.qualifier.value.toLowerCase();
            // Map those...
            fromItemsByAlias[alias] = new Set([JSON.stringify([schemaName, tableName])]);
            fromItemsBySchema[schemaName] = [].concat(fromItemsBySchema[schemaName] || []).concat(tableName);
        } else if (fromItem.expr.nodeName === 'DERIVED_QUERY') {
            const [_fromItemsByAlias, _fromItemsBySchema] = scanQuery(fromItem.expr.expr);
            // Flatten, dedupe and map those...
            const _fromItemsByAlias_flat = Object.values(_fromItemsByAlias).reduce((all, entries) => ([...all, ...entries]), []);
            fromItemsByAlias[alias] = new Set(_fromItemsByAlias_flat);
            for (const [schemaName, tableNames] of Object.entries(_fromItemsBySchema)) {
                const tableNames_total = [].concat(fromItemsBySchema[schemaName] || []).concat(tableNames);
                fromItemsBySchema[schemaName] = [...new Set(tableNames_total)];
            }
        } else {
            // Other FROM ITEM types
            fromItemsByAlias[alias] = new Set;
        }
    }

    // Done?
    if (!withMeta) return [fromItemsByAlias, fromItemsBySchema];

    // Detect AGGR_CALL_EXPR ...first in Select List
    if (scanExpr(queryJson['select_list'], ['AGGR_CALL_EXPR'])) {
        meta.hasAggrFunctionsInSelect = true;
        meta.hasAggrFunctions = true;
    } else if (queryJson.group_by_clause?.entries.length) {
        meta.hasAggrFunctions = true;
    } else if (queryJson['order_by_clause'] && scanExpr(queryJson['order_by_clause'], ['AGGR_CALL_EXPR'])) {
        meta.hasAggrFunctions = true;
    }

    // Detect SCALAR_SUBQUERY / DERIVED_QUERY
    for (const clause of ['select_list', 'where_clause', 'order_by_clause', 'offset_clause', 'limit_clause']) {
        if (queryJson[clause] && scanExpr(queryJson[clause], ['SCALAR_SUBQUERY', 'DERIVED_QUERY'])) {
            meta.hasSubquery = true;
            break;
        }
    }

    // Done!
    return [fromItemsByAlias, fromItemsBySchema, meta];
}

export function scanExpr(nodeJson, search) {
    for (const k of Object.keys(nodeJson)) {
        if (!Array.isArray(nodeJson[k])
            && !(typeof nodeJson[k] === 'object' && nodeJson[k])) continue;
        if (search.includes(nodeJson[k].nodeName)
            || scanExpr(nodeJson[k], search)) {
            return true;
        }
    }
}