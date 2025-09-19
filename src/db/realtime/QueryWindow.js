import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ExprEngine } from "../local/ExprEngine.js";
import { _eq } from "../../lang/util.js";

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

export class QueryWindow extends SimpleEmitter {

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

    #dbAdapter;
    get dbAdapter() { return this.#dbAdapter; }

    #parentWindow;
    get generator() { return this.#parentWindow; }

    #generatorDisconnect;

    #filters;
    get filters() { return this.#filters; }

    #query;
    #options;
    #fromEngine;
    #exprEngine;

    #isSingleTable;
    #isWindowedQuery;

    #localRecords;

    constructor(dbAdapter, query, filters, options = {}) {
        super();
        this.#dbAdapter = dbAdapter;
        this.#query = query;
        this.resetFilters(filters);
        this.#options = options;

        this.#isSingleTable = this.#fromEngine.aliasOrder.length === 1;
        this.#isWindowedQuery = false;

        this.#exprEngine = new ExprEngine(this.#options);

        // Subscribe tables
        const subscribeTable = ([tableName, aliases]) => {
            this.#dbAdapter.subscribe(tableName, (events) => this.#handleEvents(aliases, events));
        };
        const abortLines = [...this.#fromEngine.tableToAliases.entries()].map(subscribeTable);
        this.#generatorDisconnect = () => abortLines.forEach((c) => c());
    }

    inherit(parentWindow) {
        this.#parentWindow = parentWindow;
        if (this.#generatorDisconnect) {
            this.#generatorDisconnect();
        }
        if (!parentWindow) return;
        this.#generatorDisconnect = parentWindow.on('data', (event) => {
            if (event.kind === 'delete') {
                if (this.#localRecords.has(event.oldJointId)) {
                    this.#localDelete(event.oldJointId);
                } else return; // A delete event that mismatches
            } else {
                if (!this.#satisfiesFilters(event.jointRecord)) {
                    // Handle mismatch...
                    if (event.kind === 'update' && this.#localRecords.has(event.oldJointId)) {
                        // An update that translates to delete
                        this.#localDelete(event.oldJointId);
                        event = { ...event, kind: 'delete' };
                    } else return; // An update|insert eventthat mismatches
                }
                if (event.kind === 'update' && !this.#localRecords.has(event.oldJointId)) {
                    // An update that translates to insert
                    this.#localSet(event.newJointId, event.jointId);
                    event = { ...event, kind: 'insert' };
                }
            }
            this.#fanout(event);
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
    }

    #satisfiesFilters(jointRecord) {
        for (const expr of this.#filters) {
            if (!this.#exprEngine.evaluate(expr, jointRecord)) return false;
        }
        return true;
    }

    // --------------------------

    async initialResult() {
        const currentRecords = await this.currentRecords();
        const records = [];
        for (const [, jointRecord] of currentRecords.entries()) {
            const projection = this.#renderJointRecord(jointRecord);
            records.push(projection);
        }
        return records;
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
        // Record ID create util
        if (!jointIdCreateCallback) {
            const aliasOrder = Object.keys(result[0]);
            jointIdCreateCallback = (jointRecord) => {
                const newKeysList = aliasOrder.map((alias) => {
                    const keyNames = this.pkMap.get(alias);
                    return jointRecord[alias]
                        ? keyNames.map((k) => jointRecord[alias][k])
                        : [];
                });
                const jointId = this.#keysToJointId(...newKeysList);
                return [jointId];
            };
        }
        // Map to joint IDs
        const resultMap = new Map;
        for (const jointRecord of result) {
            const [oldJointId, newJointId] = jointIdCreateCallback(jointRecord);
            resultMap.set(oldJointId, jointRecord);
            if (newJointId) {
                jointRecord[Symbol.for('newJointId')] = newJointId;
            }
        }
        return resultMap;
    }

    #keysToJointId(...keyValues) {
        return `[${keyValues.map((a) => [].concat(a).join(',')).join('][')}]`;
    }

    #keysFromJointId(jointId) {
        return jointId.replace(/^\[|\]$/g, '').split('][');
    }

    #localSet(jointId, jointRecord) {
        this.#localRecords.set(jointId, this.#deriveLocalCopy(jointRecord));
    }

    #localDelete(jointId) {
        this.#localRecords.delete(jointId);
    }

    #localReindex(idChanges) {
        if (!idChanges.size) return;
        this.#localRecords = new Map([...this.#localRecords.entries()].map(([id, row]) => {
            if (idChanges.has(id)) id = idChanges.get(id);
            return [id, row];
        }));
    }

    #deriveLocalCopy(jointRecord) {
        const mode = this.#options.mode;
        return mode === 2
            ? jointRecord
            : Object.fromEntries(Object.keys(jointRecord).map((alias) => {
                const keyNames = this.pkMap.get(alias);
                const rowObj = jointRecord[alias]
                    ? Object.fromEntries(keyNames.map((k) => [k, jointRecord[alias][k]]))
                    : null;
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

    #normalizeEvents(aliases, events) {
        // Normalize oldKeys stuff
        const normalizedEvents = events.filter((e) => e.tag === 'insert' || e.tag === 'update' || e.tag === 'delete').map((e) => {
            const keyNames = e.oldKeys
                ? e.oldKeys.keyNames
                : this.pkMap.get(aliases[0]);
            const oldKeys = keyNames.map((k, i) => e.old?.[k] ?? e.oldKeys?.keyValues?.[i] ?? e.new[k]);
            const newKeys = keyNames.map((k, i) => e.new?.[k] ?? e.old?.[k] ?? e.oldKeys.keyValues[i]);
            return { ...e, keyNames, oldKeys, newKeys };
        });
        // 2. Normalize sequences and gather some intelligence stuff
        const normalizedEventsMap = new Map;
        const keyHistoryMap = new Map;
        for (const event of normalizedEvents) {
            const oldId = this.#keysToJointId(event.oldKeys);
            let previous, newId;
            if (previous = normalizedEventsMap.get(oldId)) {
                if (previous.tag === 'insert' && event.tag === 'delete') {
                    // Ignore; inconsequential
                    continue;
                }
                if (previous.tag === 'delete' && event.tag === 'insert') {
                    // Treat as update should in case props were changed before reinsertion
                    normalizedEventsMap.set(oldId, { ...event, tag: 'update', old: previous.old });
                    continue;
                }
                if (previous.tag === 'insert' && event.tag === 'update') {
                    // Use the lastest state of said record, but as an insert
                    normalizedEventsMap.set(oldId, { ...event, tag: 'insert' });
                    continue;
                }
                if (previous.tag === 'update' && event.tag === 'delete') {
                    // Honur latest event using same ID
                    normalizedEventsMap.delete(oldId); // Don't retain old slot
                    keyHistoryMap.delete(oldId); // Forget about any key transition in previous
                    // Flow down normally
                }
            } else if (event.tag === 'update' && (previous = keyHistoryMap.get(oldId)?.event)) {
                const _event = { ...event, oldKeys: previous.oldKeys, old: previous.old }; // Honour latest, but mapped to old keys
                normalizedEventsMap.delete(oldId); // Don't retain old slot; must come first
                normalizedEventsMap.set(oldId, _event);
                // Do history stuff
                if ((newId = this.#keysToJointId(_event.newKeys)) !== oldId) {
                    keyHistoryMap.set(newId, { oldId: keyHistoryMap.get(oldId).oldId/* original oldId */, event: _event });
                    keyHistoryMap.delete(oldId); // Forget previous history; must come only after
                }
                continue;
            } else if (event.tag === 'update' && (newId = this.#keysToJointId(event.newKeys)) !== oldId) {
                keyHistoryMap.set(newId, { oldId, event });
                // Flow down normally
            }
            normalizedEventsMap.set(oldId, event);
        }
        // 3. For updates that include primary changes
        // we'll need to derive oldJointIds from keyHistoryMap
        let jointIdCreateCallback = null;
        if (keyHistoryMap.size) {
            jointIdCreateCallback = (jointRecord) => {
                const [oldKeysList, newKeysList] = this.aliasOrder.reduce(([o, n], alias) => {
                    const keyNames = this.pkMap.get(alias);
                    const _newKeys = jointRecord[alias]
                        ? keyNames.map((k) => jointRecord[alias][k])
                        : [];
                    const _newKeys_str = this.#keysToJointId(_newKeys);
                    let _oldKeys;
                    if (aliases.includes(alias) && keyHistoryMap.has(_newKeys_str)) {
                        _oldKeys = keyHistoryMap.get(_newKeys_str).event.oldKeys;
                    } else {
                        _oldKeys = _newKeys;
                    }
                    return [[...o, _oldKeys], [...n, _newKeys]];
                }, [[], []]);
                const oldJointId = this.#keysToJointId(...oldKeysList);
                const newJointId = this.#keysToJointId(...newKeysList);
                return [oldJointId, newJointId];
            };
        }
        return [normalizedEventsMap, jointIdCreateCallback];
    }

    async #handleEvents(aliases, events) {
        const [
            normalizedEventsMap,
            jointIdCreateCallback,
        ] = this.#normalizeEvents(aliases, events);
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
        e: for (const event of normalizedEventsMap.values()) {
            switch (event.tag) {
                case 'insert':
                    const jointId_1 = this.#keysToJointId(event.newKeys);
                    const jointRecord_1 = { [aliases[0]]: event.new };
                    if (!this.#satisfiesFilters(jointRecord_1)) {
                        continue e;
                    }
                    this.#localSet(jointId_1, jointRecord_1);
                    this.#fanout({ kind: 'insert', newJointId: jointId_1, jointRecord: jointRecord_1 });
                    break;
                case 'update':
                    const jointId_2 = this.#keysToJointId(event.oldKeys);
                    if (!this.#localRecords.has(jointId_2)) {
                        continue e;
                    }
                    const jointRecord_2 = { [aliases[0]]: event.new };
                    this.#localSet(jointId_2, jointRecord_2);
                    const jointId_3 = this.#keysToJointId(event.newKeys);
                    if (jointId_3 !== jointId_2) {
                        idChanges.set(jointId_2, jointId_3);
                    }
                    this.#fanout({ kind: 'update', oldJointId: jointId_2, newJointId: jointId_3, jointRecord: jointRecord_2 });
                    break;
                case 'delete':
                    const jointId_4 = this.#keysToJointId(event.oldKeys);
                    if (!this.#localRecords.has(jointId_4)) {
                        continue e;
                    }
                    this.#localDelete(jointId_2);
                    this.#fanout({ kind: 'delete', oldJointId: jointId_4 });
                    break;
            }
        }
        this.#localReindex(idChanges);
    }

    async #handleEvents_MultiTable_Incremental(normalizedEventsMap, jointIdCreateCallback) {
        const composeDiffingPredicate = (alias, keyNames, keyValues, nullTest = 0) => {
            // Handle multi-key PKs
            if (keyNames.length > 1) {
                const operands = keyNames.map((keyName, i) => composeDiffingPredicate(alias, [keyName], [keyValues[i]], nullTest));
                return operands.reduce((left, right) => ({
                    nodeName: 'BINARY_EXPR',
                    left,
                    operator: 'AND',
                    right,
                }), operands.shift());
            }
            // Compose...
            const columnRef = { nodeName: 'COLUMN_REF1', value: keyNames[0], qualifier: { nodeName: 'TABLE_REF1', value: alias } };
            // Compose: <keyName> IS NULL
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
            // Compose: <keyName> = <keyValue>
            const valueLiteral = { nodeName: typeof keyValues[0] === 'number' ? 'NUMBER_LITERAL' : 'STRING_LITERAL', value: keyValues[0] };
            const eqExpr = {
                nodeName: 'BINARY_EXPR',
                left: columnRef,
                operator: '=',
                right: valueLiteral
            };
            // Compose?: (<keyName> IS NULL OR <keyName> = <keyValue>)
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
        for (const event of normalizedEventsMap.values()) {
            let diffingFilters = [];
            if (event.tag === 'insert') {
                // keyName === null // keyName IN [null, newKey]
                diffingFilters = [
                    aliases.map((alias) => composeDiffingPredicate(alias, event.keyNames, event.newKeys, 1)),
                    aliases.map((alias) => composeDiffingPredicate(alias, event.keyNames, event.newKeys, 2)),
                ];
            }
            if (event.tag === 'update') {
                // keyName IN [null, oldKey] // keyName IN [null, newKey]
                diffingFilters = [
                    aliases.map((alias) => composeDiffingPredicate(alias, event.keyNames, event.oldKeys, 2)),
                    aliases.map((alias) => composeDiffingPredicate(alias, event.keyNames, event.newKeys, 2)),
                ];
            }
            if (event.tag === 'delete') {
                // keyName = oldKey // keyName === null
                diffingFilters = [
                    aliases.map((alias) => composeDiffingPredicate(alias, event.keyNames, event.oldKeys, 0)),
                    aliases.map((alias) => composeDiffingPredicate(alias, event.keyNames, event.newKeys, 1)),
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
        const aliasesLength = this.aliasOrder.length;
        // Utils:
        const findPartialMatch = (oldJId) => {
            const oldJId_split = this.#keysFromJointId(oldJId);
            top: for (const newJId of remoteJointIds) {
                const newJId_split = this.#keysFromJointId(newJId);
                let matched = true;
                let nullMatched_o = false;
                let nullMatched_n = false;
                for (let i = 0; i < aliasesLength; i++) {
                    if (oldJId_split[i] === '') {
                        if (nullMatched_o) return; // Multiple slots in old
                        nullMatched_o = true;
                    }
                    if (newJId_split[i] === '') {
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
                    remoteJointIds.delete(jId); // IMPORTANT subsequent iterations should not see this anymore
                    this.#fanout({ kind: 'update', oldJointId: jId, newJointId: remoteRecords.get(jId)[Symbol.for('newJointId')] || jId, jointRecord: remoteRecords.get(jId) });
                    continue;
                }
                const newJId = findPartialMatch(jId);
                if (newJId && !enittedPartials.has(newJId)/* IMPORTANT */) {
                    // Exact match
                    this.#localSet(jId, remoteRecords.get(jId)); // Replacing any existing
                    remoteJointIds.delete(newJId); // IMPORTANT: subsequent iterations should not see this anymore
                    idChanges.set(jId, newJId);
                    enittedPartials.add(newJId);
                    this.#fanout({ kind: 'update', oldJointId: jId, newJointId: remoteRecords.get(jId)[Symbol.for('newJointId')] || jId, jointRecord: remoteRecords.get(newJId) });
                } else {
                    // Obsolete
                    this.#localDelete(jId);
                    this.#fanout({ kind: 'delete', oldJointId: jId });
                }
            } else if (remoteJointIds.has(jId)) {
                // All new
                this.#localSet(jId, remoteRecords.get(jId)); // Push new
                this.#fanout({ kind: 'insert', newJointId: jId, jointRecord: remoteRecords.get(jId) });
            }
        }
        this.#localReindex(idChanges);
    }

    #fanout(event) {
        this.emit('data', event);
        // Handle deletions
        if (event.kind === 'delete') {
            this.emit('mutation', {
                kind: event.kind,
                oldId: event.oldJointId,
            });
            return;
        }
        // Run projection
        const projection = this.#renderJointRecord(event.jointRecord);
        // Emit events
        this.emit('mutation', {
            kind: event.kind,
            ...(event.kind === 'update' ? { oldId: event.oldJointId } : {}),
            newId: event.newJointId,
            data: projection,
        });
    }
}
