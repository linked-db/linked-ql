import { _eq } from '../../lang/abstracts/util.js';
import { registry } from '../../lang/registry.js';

export const GROUPING_META = Symbol.for('grouping_meta');

export class ExprEngine {

    #derivedQueryCallback;
    #options;

    constructor(derivedQueryCallback = null, options = {}) {
        this.#derivedQueryCallback = derivedQueryCallback;
        this.#options = options;
    }

    async evaluate(node, compositeRow, queryCtx = {}) {
        if (!node) throw new Error(`ExprEngine: Cannot evaluate null/undefined node`);
        // Evaluate derived queries via callback
        if (['DERIVED_QUERY', 'SCALAR_SUBQUERY'].includes(node.NODE_NAME)) {
            if (!this.#derivedQueryCallback) {
                throw new Error(`ExprEngine: Node ${node.NODE_NAME} not supported in this context`);
            }
            return await this.#derivedQueryCallback(node, compositeRow, queryCtx);
        }
        // Dispatch to handler
        const handler = this[node.NODE_NAME];
        if (!handler) throw new Error(`ExprEngine: Unsupported AST node: ${node.NODE_NAME}`);
        return await handler.call(this, node, compositeRow, queryCtx);
    }

    async evaluateToScalar(expr, compositeRow, queryCtx) {
        if (expr instanceof registry.DerivedQuery) {
            const rows = [];
            for await (const row of await this.evaluate(expr, compositeRow, queryCtx)) rows.push(row);
            if (!rows.length) return;
            if (rows.length > 1) throw new Error(`[${node}] Subquery returned more than one row`);
            const values = Object.values(rows[0]);
            if (values.length > 1) throw new Error(`[${node}] Subquery returned more than one column`);
            return values[0] ?? null;
        }
        if (expr instanceof registry.RowConstructor) {
            if (expr.length !== 1) throw new Error(`Expects a scalar expression but got ${expr}`);
            return await this.evaluateToScalar(expr.entries()[0], compositeRow, queryCtx);
        }
        return await this.evaluate(expr, compositeRow, queryCtx);
    }

    async evaluateToList(expr, compositeRow, queryCtx) {
        if (expr instanceof registry.DerivedQuery) {
            const rows = [];
            for await (const row of await this.evaluate(expr, compositeRow, queryCtx)) rows.push(row);
            if (!rows.length) return [];
            if (Object.values(rows[0]).length > 1) throw new Error(`[${node}] Subquery returned more than one column`);
            return rows.map((r) => Object.values(r)[0]);
        }
        if (expr instanceof registry.RowConstructor) {
            return await Promise.all(expr.entries().map((e) => this.evaluateToScalar(e, compositeRow, queryCtx)));
        }
        const result = await this.evaluate(expr, compositeRow, queryCtx);
        if (!Array.isArray(result)) throw new Error(`[${expr}] Not a list`);
        return result;
    }

    // --- CLAUSES & CONSTRUCTS ---

    async SELECT_ITEM(node, compositeRow, queryCtx = {}) {
        const alias = node.alias()?.value() || (this.#options.dialect === 'mysql' ? '?column?'/* TODO */ : '?column?');
        const value = await this.evaluateToScalar(node.expr(), compositeRow, queryCtx);
        return { alias, value };
    }

    async ON_CLAUSE(node, compositeRow, queryCtx = {}) {
        return await this.evaluate(node.expr(), compositeRow, queryCtx);
    }

    async USING_CLAUSE(node, compositeRow) {
        const cols = node.columns() || [node.column()];
        return cols.every((col) => {
            const colName = col.value();
            const caliases = Object.keys(compositeRow).filter((a) => a && colName in compositeRow[a]);
            if (caliases.length < 2) throw new Error(`USING clause column ${colName} not found in both tables`);
            return caliases.reduce((v, a) => v && _eq(compositeRow[a][colName], compositeRow[caliases[0]][colName]), true);
        });
    }

    // --- EXPRESSIONS ---

    async ROW_CONSTRUCTOR(node, compositeRow, queryCtx = {}) {
        const entries = await Promise.all(node.entries().map((e) => this.evaluateToScalar(e, compositeRow, queryCtx)));
        return entries.length > 1 ? entries : entries[0];
    }

    async TYPED_ROW_CONSTRUCTOR(node, compositeRow, queryCtx = {}) {
        return await this.ROW_CONSTRUCTOR(node, compositeRow, queryCtx);
    }

    async PG_TYPED_ARRAY_LITERAL(node, compositeRow, queryCtx = {}) {
        return await Promise.all(node.entries().map((a) => this.evaluate(a, compositeRow, queryCtx)));
    }

    async CASE_EXPR(node, compositeRow, queryCtx = {}) {
        const subject = node.subject()
            ? await this.evaluate(node.subject(), compositeRow, queryCtx)
            : undefined;
        for (const branch of node) {
            const condition = await this.evaluate(branch.condition(), compositeRow, queryCtx);
            const test = subject === undefined ? !!condition : _eq(subject, condition);
            if (test) return await this.evaluate(branch.consequent(), compositeRow, queryCtx);
        }
        if (node.alternate()) return await this.evaluate(node.alternate(), compositeRow, queryCtx);
        return null;
    }

    async _CAST_EXPR(expr, dataType, compositeRow, queryCtx = {}) {
        const L = await this.evaluate(expr, compositeRow, queryCtx);
        const DT = dataType.value();
        switch (DT) {
            case 'INT': return parseInt(L);
            case 'TEXT': return String(L);
            case 'BOOLEAN':
            case 'BOOLEAN': return Boolean(L);
            default: return L;
        }
    }

    async CAST_EXPR(node, compositeRow, queryCtx = {}) {
        return await this._CAST_EXPR(node.expr(), node.dataType(), compositeRow, queryCtx);
    }

    async PG_CAST_EXPR2(node, compositeRow, queryCtx = {}) {
        return await this._CAST_EXPR(node.left(), node.right(), compositeRow, queryCtx);
    }

    async PREDICATE_EXPR(node, compositeRow, queryCtx = {}) {
        switch (node.predicate()) {
            case 'EXISTS':
                const result = (await (await this.evaluate(node.expr(), compositeRow, queryCtx)).next()).value;
                return !!result;
            default: throw new Error(`ExprEngine: Unimplemented predicate ${node.predicate()}`);
        }
    }

    async IN_EXPR(node, compositeRow, queryCtx = {}) {
        const L = await this.evaluateToScalar(node.left(), compositeRow, queryCtx);
        const R = await this.evaluateToList(node.right(), compositeRow, queryCtx);
        const negation = node.negation();
        const res = (val) => negation ? !val : val;
        return res(R.some((v) => _eq(L, v)));
    }

    async BETWEEN_EXPR(node, compositeRow, queryCtx = {}) {
        const L = await this.evaluateToScalar(node.left(), compositeRow, queryCtx);
        const R = await Promise.all(node.right().map((e) => this.evaluateToScalar(e, compositeRow, queryCtx)));
        const negation = node.negation();
        const res = (val) => negation ? !val : val;
        return res(L >= R[0] && L <= R[1]);
    }

    async DISTINCT_FROM_EXPR(node, compositeRow, queryCtx = {}) {
        const L = await this.evaluate(node.left(), compositeRow, queryCtx);
        const R = await this.evaluate(node.right(), compositeRow, queryCtx);
        const negation = node.logic() === 'IS NOT';
        const res = (val) => negation ? !val : val;
        return res(!_eq(L, R));
    }

    async BINARY_EXPR(node, compositeRow, queryCtx = {}) {
        const op = node.operator().toUpperCase();
        const negation = node.negation();

        const res = (val) => negation ? !val : val;

        const compare = (L, R) => {
            const anyIsNull = L === null || R === null;
            if (anyIsNull && op !== 'IS' && op !== 'IS NOT') return false;
            switch (op) {
                case '=':
                case 'IS': return _eq(L, R);
                case '<>':
                case '!=':
                case 'IS NOT': return !_eq(L, R);
                case '<': return L < R;
                case '<=': return L <= R;
                case '>': return L > R;
                case '>=': return L >= R;
                case 'LIKE': return likeCompare(String(L), String(R));
                default: throw new Error(`ExprEngine: Unsupported comparison operator ${op}`);
            }
        };

        if (node.right() instanceof registry.QuantitativeExpr) {
            const quantifier = node.right().quantifier();
            const L = await this.evaluateToScalar(node.left(), compositeRow, queryCtx);
            const R = await this.evaluateToList(node.right().expr(), compositeRow, queryCtx);
            switch (quantifier) {
                case 'ALL': return res(R.every((R) => compare(L, R)));
                case 'ANY':
                case 'SOME': return res(R.some((R) => compare(L, R)));
            }
        }

        const L = await this.evaluateToScalar(node.left(), compositeRow, queryCtx);
        const R = await this.evaluateToScalar(node.right(), compositeRow, queryCtx);

        switch (op) {
            // Comparison
            case '=':
            case 'IS':
            case '<>':
            case '!=':
            case 'IS NOT':
            case '<':
            case '<=':
            case '>':
            case '>=':
            case 'LIKE': return res(compare(L, R));
            // Arithmetic
            case '+': return Number(L) + Number(R);
            case '-': return Number(L) - Number(R);
            case '/': return Number(L) / Number(R);
            case '*': return Number(L) * Number(R);
            case '%': return Number(L) % Number(R);
            // String
            case '||': return String(L ?? '') + String(R ?? '');
            // Logical
            case 'AND': return res(Boolean(L) && Boolean(R));
            case 'OR': return res(Boolean(L) || Boolean(R));
            default: throw new Error(`ExprEngine: Unsupported binary operator ${op}`);
        }
    }

    async UNARY_EXPR(node, compositeRow, queryCtx = {}) {
        const op = node.operator().toUpperCase();
        const v = await this.evaluateToScalar(node.operand(), compositeRow, queryCtx);
        switch (op) {
            case 'NOT': return !Boolean(v);
            case '-': return -v;
            default: throw new Error(`ExprEngine: Unsupported unary operator ${op}`);
        }
    }

    async CALL_EXPR(node, compositeRow, queryCtx = {}) {
        const name = node.name().toUpperCase();

        // System functions

        if (name === 'GROUPING') {
            const args = expr.arguments();
            if (args.length !== 1) throw new Error("GROUPING() takes exactly one argument");
            const meta = row[GROUPING_META];
            if (!meta) throw new Error("GROUPING() used outside of grouping context");

            const idx = meta.exprIndex.get(args[0].stringify());
            if (idx === undefined) {
                throw new Error(`[${node}] argument ${args[0]} not found in GROUP BY clause`);
            }
            return (meta.groupingId & (1 << idx)) ? 1 : 0;
        }

        if (name === 'GROUPING_ID') {
            // GROUPING_ID(expr [, expr ...]) or with no args
            const args = expr.arguments();
            const meta = row[GROUPING_META];
            if (!meta) throw new Error("GROUPING_ID() used outside of grouping context");

            if (args.length === 0) {
                return meta.groupingId;
            }

            let mask = 0;
            for (const arg of args) {
                const idx = meta.exprIndex.get(arg.stringify());
                if (idx === undefined) {
                    throw new Error(`[${node}] argument ${arg} not found in GROUP BY clause`);
                }
                if (meta.groupingId & (1 << idx)) {
                    mask |= (1 << idx);
                }
            }
            return mask;
        }

        if (name === 'VALUES'/* MySQL */ && compositeRow.EXCLUDED && typeof compositeRow.EXCLUDED === 'object') {
            const fieldName = node.arguments()[0].value();
            return compositeRow.EXCLUDED[fieldName];
        }

        // Classic functions

        const args = await Promise.all(node.arguments().map((a) => this.evaluate(a, compositeRow, queryCtx)));

        // System functions (Cont.)

        if (name === 'UNNEST') {
            return (function* () {
                for (let i = 0; i < args[0].length; i++) yield args.map((arr) => arr[i] ?? null);
            })();
        }

        if (name === 'GENERATE_SERIES') {
            return (function* () {
                for (let x = args[0]; x <= args[1]; x += args[2] ?? 1) yield [x];
            })();
        }

        // Classic, foreal

        switch (name) {
            // Classic functions
            case 'LOWER': return String(args[0] ?? '').toLowerCase();
            case 'UPPER': return String(args[0] ?? '').toUpperCase();
            case 'LENGTH': return args[0] == null ? null : String(args[0]).length;
            case 'ABS': return Math.abs(Number(args[0]));
            case 'COALESCE': return args.reduce((prev, cur) => prev !== null ? prev : cur, null);
            case 'NULLIF': return _eq(args[0], args[1]) ? null : args[0];

            // JSON functions (Postgres & MySQL variants)
            case 'JSON_BUILD_ARRAY':
            case 'JSON_ARRAY': return args;
            case 'JSON_BUILD_OBJECT':
            case 'JSON_OBJECT': {
                if (args.length % 2 !== 0) throw new Error('JSON_BUILD_OBJECT requires an even number of arguments');
                const buildObj = Object.create(null);
                for (let i = 0; i < args.length; i += 2) {
                    buildObj[args[i]] = args[i + 1];
                }
                return buildObj;
            }

            default: throw new Error(`ExprEngine: Unsupported function ${node.name()}`);
        }
    }

    async AGGR_CALL_EXPR(node, compositeRow, queryCtx = {}) {
        const fn = node.name().toUpperCase();
        const args = node.arguments();

        // ----------------------

        const meta = compositeRow[GROUPING_META];
        if (!meta) throw new Error('GROUPING() called outside of GROUP BY context');
        const group = meta.group;
        const expr = args[0] || null;

        switch (fn) {
            case 'COUNT': {
                if (!expr || expr instanceof registry.ColumnRef0) return group.length;
                let cnt = 0;
                for (const member of group) {
                    const v = await this.evaluate(expr, member, queryCtx);
                    if (v !== null && v !== undefined) cnt++;
                }
                return cnt;
            }
            case 'SUM':
            case 'AVG': {
                if (!expr) return null;
                let sum = 0, cnt = 0;
                for (const member of group) {
                    const v = await this.evaluate(expr, member, queryCtx);
                    if (v !== null && !Number.isNaN(Number(v))) {
                        sum += Number(v);
                        cnt++;
                    }
                }
                if (fn === 'SUM') return cnt === 0 ? null : sum;
                return cnt === 0 ? null : sum / cnt;
            }
            case 'MIN':
            case 'MAX': {
                if (!expr) return null;
                let result = null;
                for (const member of group) {
                    const v = await this.evaluate(expr, member, queryCtx);
                    if (v == null) continue;
                    if (result == null) {
                        result = v;
                    } else {
                        if (fn === 'MIN' && v < result) result = v;
                        if (fn === 'MAX' && v > result) result = v;
                    }
                }
                return result;
            }
            // JSON aggregation functions (Postgres & MySQL variants)
            case 'JSON_AGG':
            case 'JSON_ARRAYAGG': {
                if (!expr) return [];
                const arr = [];
                for (const member of group) {
                    arr.push(await this.evaluate(expr, member, queryCtx));
                }
                return arr;
            }
            case 'JSON_OBJECT_AGG':
            case 'JSON_OBJECTAGG': {
                // Postgres: JSON_OBJECT_AGG(key, value)
                const keyExpr = args[0], valExpr = args[1];
                if (!keyExpr || !valExpr) return {};
                const obj = Object.create(null);
                for (const member of group) {
                    const k = await this.evaluate(keyExpr, member, queryCtx);
                    const v = await this.evaluate(valExpr, member, queryCtx);
                    obj[k] = v;
                }
                return obj;
            }
        }

        // ----------------------

        const rowIndex = group.indexOf(compositeRow);
        if (rowIndex === -1) throw new Error(`ExprEngine: Row not found in group`);

        switch (fn) {
            case 'ROW_NUMBER':
                return rowIndex + 1;

            case 'RANK': {
                const orderExpr = args[0];
                if (!orderExpr) throw new Error(`RANK() requires an ORDER BY expression`);
                const values = await Promise.all(group.map((r) => this.evaluate(orderExpr, r, queryCtx)));
                const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
                const currentVal = await this.evaluate(orderExpr, compositeRow, queryCtx);
                return uniqueSorted.indexOf(currentVal) + 1;
            }

            case 'DENSE_RANK': {
                const orderExpr = args[0];
                if (!orderExpr) throw new Error(`DENSE_RANK() requires an ORDER BY expression`);
                const values = await Promise.all(group.map((r) => this.evaluate(orderExpr, r, queryCtx)));
                const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
                const currentVal = await this.evaluate(orderExpr, compositeRow, queryCtx);
                return uniqueSorted.indexOf(currentVal) + 1;
            }

            case 'NTILE': {
                const buckets = Number(await this.evaluate(args[0], compositeRow, queryCtx));
                if (!Number.isInteger(buckets) || buckets <= 0) {
                    throw new Error(`NTILE(n) requires a positive integer`);
                }
                const size = Math.ceil(group.length / buckets);
                return Math.floor(rowIndex / size) + 1;
            }

            case 'LAG': {
                const expr = args[0];
                const offset = Number(args[1]?.value || 1);
                const defaultValue = args[2] ? await this.evaluate(args[2], compositeRow, queryCtx) : null;
                const target = group[rowIndex - offset];
                return target ? await this.evaluate(expr, target, queryCtx) : defaultValue;
            }

            case 'LEAD': {
                const expr = args[0];
                const offset = Number(args[1]?.value() || 1);
                const defaultValue = args[2] ? await this.evaluate(args[2], compositeRow, queryCtx) : null;
                const target = group[rowIndex + offset];
                return target ? await this.evaluate(expr, target, queryCtx) : defaultValue;
            }

            case 'FIRST_VALUE': {
                const expr = args[0];
                return await this.evaluate(expr, group[0], queryCtx);
            }

            case 'LAST_VALUE': {
                const expr = args[0];
                return await this.evaluate(expr, group[group.length - 1], queryCtx);
            }

            default: throw new Error(`ExprEngine: Unsupported window function ${node.name()}`);
        }
    }

    async COLUMN_REF1(node, compositeRow) {
        if (!node) return undefined;
        const colName = node.value();
        const qualName = node.qualifier()?.value() || '';

        if (qualName) {
            const table = compositeRow[qualName];
            if (!table) throw new Error(`Table alias ${qualName} not found in the current context`);
            return table[colName];
        }
        for (const alias of Object.keys(compositeRow)) {
            const table = compositeRow[alias];
            if (colName in table) return table[colName];
        }
        console.log('____________------', compositeRow);
        throw new Error(`Column ${colName} not found in the current context`);
    }

    async STRING_LITERAL(node) { return node.value(); }
    async NUMBER_LITERAL(node) { return Number(node.value()); }
    async BOOL_LITERAL(node) { return Boolean(node.value()); }
    async NULL_LITERAL() { return null; }
}

function likeCompare(str, pattern) {
    const esc = pattern
        .replace(/([.+^=!:${}()|\[\]\\/])/g, '\\$1')
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
    try {
        return new RegExp(`^${esc}$`, 'i').test(str);
    } catch {
        return false;
    }
}