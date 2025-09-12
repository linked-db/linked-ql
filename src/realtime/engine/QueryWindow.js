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

    constructor(dbAdapter, query, filters, options = {}) {
        super();
        this.#dbAdapter = dbAdapter;
        this.#query = query;
        this.resetFilters(filters);
        this.#options = options;
        this.#exprEngine = new ExprEngine(this.#options);
        //this.#fromEngine = new FromEngine({ fromItems: query.from_clause.entries, joinClauses: query.join_clauses }, options);
    }

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

    inherit(parentWindow) {
        this.#parentWindow = parentWindow;
        if (this.#generatorDisconnect) {
            this.#generatorDisconnect();
        }
        if (!parentWindow) return;
        this.#generatorDisconnect = parentWindow.on('data', (event) => {
            this.handle(event);
        });
    }

    resetFilters(newFilters) {
        this.#filters = newFilters;
    }

    handle(event) {
        // Handle deletions
        if (event.kind === 'delete') {
            this.emit('mutation', {
                kind: event.kind,
                oldId: event.oldCompositeId,
            });
            this.emit('data', event);
            return;
        }
        // Pass thru filters
        for (const expr of this.#filters) {
            if (!this.#exprEngine.evaluate(expr, event.compositeRow)) return;
        }
        // Run projection
        const projection = {};
        for (const selectItem of this.#query.select_list.entries) {
            const alias_cs = selectItem.alias?.delim
                ? selectItem.alias.value
                : selectItem.value.toLowerCase();
            const value = this.#exprEngine.evaluate(selectItem.expr, event.compositeRow);
            projection[alias_cs] = value;
        }
        // Emit events
        this.emit('mutation', {
            kind: event.kind,
            ...(event.kind === 'patch' ? { oldId: event.oldCompositeId } : {}),
            id: event.compositeId,
            data: projection,
        });
        this.emit('data', event);
    }

    async initialResult(renderProjection = false) {
        let resultCompositeRows;
        if (this.#parentWindow) {
            resultCompositeRows = await this.#parentWindow.initialResult(false);
            // Filter
        } else {
            resultCompositeRows = await this.#query();
        }
        // Render?
        if (renderProjection) {
        }
        return renderProjection;
    }

    async #query(extraFilter = null) {
    }
}
