import { _eq } from '../../lang/abstracts/util.js';

export const GROUP_SYMBOL = Symbol.for('group');

export class ExprEngine {

    #options;
    #derivedQueryCallback;

    constructor(options = {}, derivedQueryCallback = null) {
        this.#options = options;
        this.#derivedQueryCallback = derivedQueryCallback;
    }

    async evaluate(node, compositeRow, cteRegistry = null, txId = null) {
        if (!node) throw new Error(`ExprEngine: Cannot evaluate null/undefined node`);
        // Evaluate derived queries via callback
        if (['DERIVED_QUERY', 'SCALAR_SUBQUERY'].includes(node.NODE_NAME)) {
            if (!this.#derivedQueryCallback) {
                throw new Error(`ExprEngine: Node ${node.NODE_NAME} not supported in this context`);
            }
            return await this.#derivedQueryCallback(node, compositeRow, cteRegistry, txId);
        }
        // Dispatch to handler
        const handler = this[node.NODE_NAME];
        if (!handler) throw new Error(`ExprEngine: Unsupported AST node: ${node.NODE_NAME}`);
        return await handler.call(this, node, compositeRow);
    }

    // --- CLAUSES & CONSTRUCTS ---

    async SELECT_ITEM(node, compositeRow, cteRegistry = null, txId = null) {
        const alias = node.alias()?.value() || (this.#options.dialect === 'mysql' ? '?column?'/* TODO */ : '?column?');
        const value = await this.evaluate(node.expr(), compositeRow, cteRegistry, txId);
        return { alias, value };
    }

    async ON_CLAUSE(node, compositeRow, cteRegistry = null, txId = null) {
        return await this.evaluate(node.expr(), compositeRow, cteRegistry, txId);
    }

    async USING_CLAUSE(node, compositeRow) {
        const cols = node.column().entries?.() || [node.column()];
        return cols.every((col) => {
            const colName = col.value();
            const caliases = Object.keys(compositeRow).filter((a) => a && colName in compositeRow[a]);
            if (caliases.length < 2) throw new Error(`USING clause column ${colName} not found in both tables`);
            return caliases.reduce((v, a) => v && _eq(compositeRow[a][colName], compositeRow[caliases[0]][colName]), true);
        });
    }

    // --- EXPRESSIONS ---

    async ROW_CONSTRUCTOR(node, compositeRow, cteRegistry = null, txId = null) {
        const entries = await Promise.all(node.entries().map((e) => this.evaluate(e, compositeRow, cteRegistry, txId)));
        return entries.length > 1 ? entries : entries[0];
    }

    async BINARY_EXPR(node, compositeRow, cteRegistry = null, txId = null) {
        const op = node.operator().toUpperCase();
        const L = await this.evaluate(node.left(), compositeRow, cteRegistry, txId);
        const R = await this.evaluate(node.right(), compositeRow, cteRegistry, txId);
        if (L == null || R == null) {
            if (op === 'IS') return L === R;
            if (op === 'IS NOT') return L !== R;
        }

        switch (op) {
            case '=':
            case '==': return _eq(L, R);
            case '<>':
            case '!=': return !_eq(L, R);
            case '<': return L < R;
            case '<=': return L <= R;
            case '>': return L > R;
            case '>=': return L >= R;
            case 'AND': return Boolean(L) && Boolean(R);
            case 'OR': return Boolean(L) || Boolean(R);
            case 'LIKE': return likeCompare(String(L), String(R));
            case 'IN': return [].concat(R).some((v) => _eq(L, v));
            case '||': return (L ?? '') + (R ?? '');
            default: throw new Error(`ExprEngine: Unsupported binary operator ${op}`);
        }
    }

    async UNARY_EXPR(node, compositeRow, cteRegistry = null, txId = null) {
        const op = node.operator().toUpperCase();
        const v = await this.evaluate(node.operand(), compositeRow, cteRegistry, txId);
        switch (op) {
            case 'NOT': return !Boolean(v);
            case '-': return -v;
            default: throw new Error(`ExprEngine: Unsupported unary operator ${op}`);
        }
    }

    async CALL_EXPR(node, compositeRow, cteRegistry = null, txId = null) {
        const name = node.name().toUpperCase();
        const args = await Promise.all(node.arguments().map((a) => this.evaluate(a, compositeRow, cteRegistry, txId)));
        switch (name) {
            case 'LOWER': return String(args[0] ?? '').toLowerCase();
            case 'UPPER': return String(args[0] ?? '').toUpperCase();
            case 'LENGTH': return args[0] == null ? null : String(args[0]).length;
            case 'ABS': return Math.abs(Number(args[0]));
            // JSON functions (Postgres & MySQL variants)
            case 'JSON_OBJECT': {// MySQL: JSON_OBJECT(key1, val1, key2, val2, ...)
                if (args.length % 2 !== 0) throw new Error('JSON_OBJECT requires an even number of arguments');
                const obj = Object.create(null);
                for (let i = 0; i < args.length; i += 2) {
                    obj[args[i]] = args[i + 1];
                }
                return obj;
            }
            case 'JSON_ARRAY': // MySQL: JSON_ARRAY(val1, val2, ...)
                return args;
            case 'JSON_BUILD_OBJECT': {// Postgres: JSON_BUILD_OBJECT(key1, val1, ...)
                if (args.length % 2 !== 0) throw new Error('JSON_BUILD_OBJECT requires an even number of arguments');
                const buildObj = Object.create(null);
                for (let i = 0; i < args.length; i += 2) {
                    buildObj[args[i]] = args[i + 1];
                }
                return buildObj;
            }
            case 'JSON_BUILD_ARRAY': // Postgres: JSON_BUILD_ARRAY(val1, ...)
                return args;
            default: throw new Error(`ExprEngine: Unsupported function ${node.name()}`);
        }
    }

    async AGGR_CALL_EXPR(node, compositeRow, cteRegistry = null, txId = null) {
        const fn = node.name().toUpperCase();
        const args = node.arguments();

        // ----------------------

        const group = compositeRow?.[GROUP_SYMBOL] || [];
        const expr = args[0] || null;

        switch (fn) {
            case 'COUNT': {
                if (!expr) return group.length;
                let cnt = 0;
                for (const member of group) {
                    const v = await this.evaluate(expr, member, cteRegistry, txId);
                    if (v !== null && v !== undefined) cnt++;
                }
                return cnt;
            }
            case 'SUM':
            case 'AVG': {
                if (!expr) return null;
                let sum = 0, cnt = 0;
                for (const member of group) {
                    const v = await this.evaluate(expr, member, cteRegistry, txId);
                    if (v != null && !Number.isNaN(Number(v))) {
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
                    const v = await this.evaluate(expr, member, cteRegistry, txId);
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
                    arr.push(await this.evaluate(expr, member, cteRegistry, txId));
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
                    const k = await this.evaluate(keyExpr, member, cteRegistry, txId);
                    const v = await this.evaluate(valExpr, member, cteRegistry, txId);
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
                const values = await Promise.all(group.map((r) => this.evaluate(orderExpr, r, cteRegistry, txId)));
                const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
                const currentVal = await this.evaluate(orderExpr, compositeRow, cteRegistry, txId);
                return uniqueSorted.indexOf(currentVal) + 1;
            }

            case 'DENSE_RANK': {
                const orderExpr = args[0];
                if (!orderExpr) throw new Error(`DENSE_RANK() requires an ORDER BY expression`);
                const values = await Promise.all(group.map((r) => this.evaluate(orderExpr, r, cteRegistry, txId)));
                const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
                const currentVal = await this.evaluate(orderExpr, compositeRow, cteRegistry, txId);
                return uniqueSorted.indexOf(currentVal) + 1;
            }

            case 'NTILE': {
                const buckets = Number(await this.evaluate(args[0], compositeRow, cteRegistry, txId));
                if (!Number.isInteger(buckets) || buckets <= 0) {
                    throw new Error(`NTILE(n) requires a positive integer`);
                }
                const size = Math.ceil(group.length / buckets);
                return Math.floor(rowIndex / size) + 1;
            }

            case 'LAG': {
                const expr = args[0];
                const offset = Number(args[1]?.value || 1);
                const defaultValue = args[2] ? await this.evaluate(args[2], compositeRow, cteRegistry, txId) : null;
                const target = group[rowIndex - offset];
                return target ? await this.evaluate(expr, target, cteRegistry, txId) : defaultValue;
            }

            case 'LEAD': {
                const expr = args[0];
                const offset = Number(args[1]?.value() || 1);
                const defaultValue = args[2] ? await this.evaluate(args[2], compositeRow, cteRegistry, txId) : null;
                const target = group[rowIndex + offset];
                return target ? await this.evaluate(expr, target, cteRegistry, txId) : defaultValue;
            }

            case 'FIRST_VALUE': {
                const expr = args[0];
                return await this.evaluate(expr, group[0], cteRegistry, txId);
            }

            case 'LAST_VALUE': {
                const expr = args[0];
                return await this.evaluate(expr, group[group.length - 1], cteRegistry, txId);
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
        throw new Error(`Column ${colName} not found in the current context`);
    }

    async STRING_LITERAL(node) { return node.value(); }
    async NUMBER_LITERAL(node) { return Number(node.value()); }
    async BOOLEAN_LITERAL(node) { return Boolean(node.value()); }
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