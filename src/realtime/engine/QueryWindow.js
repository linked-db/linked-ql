import { SimpleEmitter } from './SimpleEmitter.js';
import { FromEngine } from './FromEngine.js';
import { ExprEngine } from "./ExprEngine.js";
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

    #localResult;

    constructor(dbAdapter, query, filters, options = {}) {
        super();
        this.#dbAdapter = dbAdapter;
        this.#query = query;
        this.resetFilters(filters);
        this.#options = options;

        this.#isSingleTable = this.#fromEngine.aliasOrder.length === 1;
        this.#isWindowedQuery = false;

        this.#exprEngine = new ExprEngine(this.#options);
        //this.#fromEngine = new FromEngine({ fromItems: query.from_clause.entries, joinClauses: query.join_clauses }, options);

        // Subscribe tables
        const subscribeTable = ([tableName, aliases]) => {
            this.#dbAdapter.subscribe(tableName, (events) => this.#handleChanges(tableName, aliases, events));
        };
        const abortLines = [...this.#fromEngine.tablesToAliases.entries()].map(subscribeTable);
        this.#generatorDisconnect = () => abortLines.forEach((c) => c());
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

    inherit(parentWindow) {
        this.#parentWindow = parentWindow;
        if (this.#generatorDisconnect) {
            this.#generatorDisconnect();
        }
        if (!parentWindow) return;
        this.#generatorDisconnect = parentWindow.on('data', (event) => {
            if (event.kind === 'delete') {
                if (this.#localResult.has(event.oldCompositeId)) {
                    this.#localResult.delete(event.oldCompositeId);
                } else return; // A delete event that mismatches
            } else {
                for (const expr of this.#filters) {
                    if (!this.#exprEngine.evaluate(expr, event.compositeRow)) {
                        // Handle mismatch...
                        if (event.kind === 'update' && this.#localResult.has(event.oldCompositeId)) {
                            // An update that translates to delete
                            this.#localResult.delete(event.oldCompositeId);
                            event = { ...event, kind: 'delete' };
                        } else return; // An update|insert eventthat mismatches
                    }
                }
                if (event.kind === 'update' && !this.#localResult.has(event.oldCompositeId)) {
                    // An update that translates to insert
                    this.#setLocal(event.newCompositeId, event.compositeId);
                    event = { ...event, kind: 'insert' };
                }
            }
            this.#fanout(event);
        });
    }

    // --------------------------

    async initialResult() {
        const currentResult = await this.currentResult();
        const records = [];
        for (const [, compositeRow] of currentResult.entries()) {
            const projection = this.#renderCompositeRow(compositeRow);
            records.push(projection);
        }
        return records;
    }

    async currentResult() {
        const mode = this.#options.mode;
        // Try reuse...
        if (this.#localResult && mode === 2) {
            return new Set(this.#localResult);
        }
        let resultCompositeRows;
        // Inherit or run fresh...
        if (this.#parentWindow) {
            resultCompositeRows = await this.#parentWindow.currentResult();
            row: for (const [compositeId, compositeRow] of resultCompositeRows.entries()) {
                for (const expr of this.#filters) {
                    if (!this.#exprEngine.evaluate(expr, compositeRow)) {
                        resultCompositeRows.delete(compositeId);
                        continue row;
                    }
                }
            }
        } else {
            resultCompositeRows = await this.#queryHeadless();
        }
        // renderProjection? This is first time call
        if (!this.#localResult) {
            this.#localResult = new Map;
            for (const [compositeId, compositeRow] of resultCompositeRows) {
                this.#setLocal(compositeId, compositeRow);
            }
        }
        return resultCompositeRows;
    }

    async #queryHeadless(extraFilters = []) {
    }

    #setLocal(compositeId, compositeRow) {
        const mode = this.#options.mode;
        this.#localResult.set(compositeId, mode === 2 ? compositeRow : null);
    }

    #renderCompositeRow(compositeRow) {
        const projection = {};
        for (const selectItem of this.#query.select_list.entries) {
            const alias_cs = selectItem.alias.delim
                ? selectItem.alias.value
                : selectItem.alias.value.toLowerCase();
            const value = this.#exprEngine.evaluate(selectItem.expr, compositeRow);
            projection[alias_cs] = value;
        }
        return projection;
    }

    // --------------------------

    async #handleChanges(tableName, aliases, events) {
        // Utils:
        const composeDiffingPredicate = (alias, keyNames, keyValues, nullTest = 0) => {
            // Handle multi-key PKs
            if (keyNames.length > 1) {
                const operands = keyNames.map((keyName, i) => composeDiffingPredicate(alias, [keyName], [keyValues[i]]));
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
        // 1. ---------
        // Do wholistic diffing?
        if (!this.#isSingleTable && this.#isWindowedQuery) {
            const remoteResult = await this.#queryHeadless();
            this.#diffComposites(this.#localResult, remoteResult);
            return;
        }
        // 2. ---------
        // Normalize oldKeys stuff
        const normalizedEvents = events.map((e) => {
            const keyNames = e.oldKeys 
                ? e.oldKeys.keyNames
                : this.pkMap.get(tableName);
            const oldKeys = keyNames.map((k, i) => e.old?.[k] ?? e.oldKeys?.keyValues?.[i] ?? e.new[k] );
            const newKeys = keyNames.map((k, i) => e.new?.[k] ?? e.old?.[k] ?? e.oldKeys.keyValues[i]);
            return { ...e, keyNames, oldKeys, newKeys };
        });
        const keyToString = (keyValues) => keyValues.join('|')
        // Normalize events
        const normalizedEventsMap = new Map;
        for (const event of normalizedEvents) {
            const oldId = keyToString(event.oldKeys);
            let existing;
            if (existing = normalizedEventsMap.get(oldId)) {
                if (existing.tag === 'insert' && event.tag === 'delete') {
                    // Ignore; inconsequential
                    continue;
                }
                if (existing.tag === 'delete' && event.tag === 'insert') {
                    // Treat as update should in case props were changed before reinsertion
                    // but set oldKeys stuff
                    normalizedEventsMap.set(oldId, { ...event, tag: 'update', oldKeys: existing.oldKeys, old: existing.old });
                    continue;
                }
                if (existing.tag === 'insert' && event.tag === 'update') {
                    // Use the lastest state of said record, but as an insert
                    normalizedEventsMap.set(oldId, { ...event, tag: 'insert' });
                    continue;
                }
                if (existing.tag === 'update' && event.tag === 'delete') {
                    // Honur latest event using same ID
                    normalizedEventsMap.delete(oldId); // Don't retain old slot
                }
            } else if (event.tag === 'update'
                && (existing = [...normalizedEventsMap.values()].find((o) => o.tag === 'update' && keyToString(o.newKeys) === oldId))) {
                normalizedEventsMap.delete(oldId); // Don't retain old slot
                normalizedEventsMap.set(oldId, { ...event, oldKeys: existing.oldKeys, old: existing.old }); // Honour latest, but with old keys
                continue
            }
            normalizedEventsMap.set(oldId, event);
        }
        // 3. ---------
        // Do inline diffing?
        if (this.#isSingleTable) {
            for (const event of normalizedEventsMap.values()) {
            }
            return;
        }
        // 4. ---------
        // Do partial diffing!
        const localResult = new Map;
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
            // Execute...
            row: for (const [compositeId, compositeRow] of this.#localResult.entries()) {
                for (const expr of diffingFilters[0]) {
                    if (!this.#exprEngine.evaluate(expr, compositeRow)) {
                        continue row;
                    }
                }
                localResult.set(compositeId, compositeRow);
            }
        }
        const remoteResult = await this.#queryHeadless(diffingFilters[1]);
        const remoteCompositeIds_old = new Set;
        this.#diffComposites(localResult, remoteResult, remoteCompositeIds_old);
    }

    #diffComposites(localResult, remoteResult, remoteCompositeIds_old) {
        // Build keys
        const localCompositeIds = new Set(localResult.keys());
        const remoteCompositeIds_new = new Set(remoteResult.keys());
        const allCompositeIds = new Set([
            ...localCompositeIds,
            ...remoteCompositeIds_new
        ]);
        const aliasesLength = this.aliasOrder.length;
        // Utils:
        const findPartialMatch = (oldCId) => {
            const oldCId_split = oldCId.split('|');
            top: for (const newCId of remoteCompositeIds_new) {
                const newCId_split = newCId.split('|');
                let matched = true;
                let nullMatched_o = false;
                let nullMatched_n = false;
                for (let i = 0; i < aliasesLength; i++) {
                    if (oldCId_split[i].endsWith(':null')) {
                        if (nullMatched_o) return; // Multiple slots in old
                        nullMatched_o = true;
                    }
                    if (newCId_split[i].endsWith(':null')) {
                        if (nullMatched_n) continue top; // Multiple slots in new
                        nullMatched_n = true;
                    }
                    matched = matched && (oldCId_split[i] === newCId_split[i] || nullMatched_o || nullMatched_n);
                }
                if (matched) return newCId;
            }
        };
        // The diffing...
        const idChanges = new Map;
        const enittedPartials = new Set;
        for (const cId of allCompositeIds) {
            if (localCompositeIds.has(cId)) {
                // Exact match
                if (remoteCompositeIds_new.has(cId)) {
                    this.#setLocal(cId, remoteResult.get(cId)[1]); // Replacing any existing
                    remoteCompositeIds_new.delete(cId); // IMPORTANT subsequent iterations should not see this anymore
                    this.#fanout({ kind: 'update', oldCompositeId: cId, newCompositeId: remoteResult.get(cId)[0], compositeRow: remoteResult.get(cId)[1] });
                    continue;
                }
                const newCId = findPartialMatch(cId);
                if (newCId && !enittedPartials.has(newCId)/* IMPORTANT */) {
                    // Exact match
                    this.#setLocal(cId, remoteResult.get(cId)[1]); // Replacing any existing
                    remoteCompositeIds_new.delete(newCId); // IMPORTANT: subsequent iterations should not see this anymore
                    idChanges.set(cId, newCId);
                    enittedPartials.add(newCId);
                    this.#fanout({ kind: 'update', oldCompositeId: cId, newCompositeId: remoteResult.get(newCId)[0], compositeRow: remoteResult.get(newCId)[1] });
                } else {
                    // Obsolete
                    this.#localResult.delete(cId);
                    this.#fanout({ kind: 'delete', oldCompositeId: cId });
                }
            } else if (remoteCompositeIds_new.has(cId)) {
                // All new
                this.#setLocal(cId, remoteResult.get(cId)[1]);; // Push new
                this.#fanout({ kind: 'insert', newCompositeId: cId, compositeRow: remoteResult.get(cId)[1] });
            }
        }
        // Normalize localResult
        if (idChanges.size) {
            this.#localResult = new Map([...this.#localResult.entries()].map(([id, row]) => {
                if (idChanges.has(id)) id = idChanges.get(id);
                return [id, row];
            }));
        }
    }

    #fanout(event) {
        this.emit('data', event);
        // Handle deletions
        if (event.kind === 'delete') {
            this.emit('mutation', {
                kind: event.kind,
                oldId: event.oldCompositeId,
            });
            return;
        }
        // Run projection
        const projection = this.#renderCompositeRow(event.compositeRow);
        // Emit events
        this.emit('mutation', {
            kind: event.kind,
            ...(event.kind === 'update' ? { oldId: event.oldCompositeId } : {}),
            newId: event.newCompositeId,
            data: projection,
        });
    }
}
