import { _eq } from '../../lang/abstracts/util.js';

export const GROUP_SYMBOL = Symbol.for('group');

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

export class ExprEngine {
    #options;

    constructor(options = {}) {
        this.#options = options;
    }

    evaluate(node, compositeRow, entireWindow = null) {
        if (!node) return null;
        if (!node.nodeName && node.left) {
            node.nodeName = 'BINARY_EXPR';
        }
        const handler = this[node.nodeName];
        if (!handler) {
            throw new Error(`ExprEngine: Unsupported AST node: ${node.nodeName}`);
        }
        return handler.call(this, node, compositeRow, entireWindow);
    }

    // --- CLAUSES ---

    ON_CLAUSE(node, compositeRow, entireWindow = null) {
        return this.evaluate(node.expr, compositeRow, entireWindow);
    }

    USING_CLAUSE(node, compositeRow) {
        const [leftAlias, rightAlias] = Object.keys(compositeRow);
        if (!leftAlias || !rightAlias) return false;

        const cols = Array.isArray(node.column.entries) ? node.column.entries : [node.column];
        return cols.every((col) =>
            compositeRow[leftAlias][col.value] === compositeRow[rightAlias][col.value]
        );
    }

    // --- EXPRESSIONS ---

    SCALAR_SUBQUERY(node, compositeRow, entireWindow = null) {
        throw new Error(`SCALAR_SUBQUERY unimplemented`);
    }

    ROW_CONSTRUCTOR(node, compositeRow, entireWindow = null) {
        const entries = node.entries.map((e) => this.evaluate(e, compositeRow, entireWindow));
        return entries.length > 1 ? entries : entries[0];
    }

    BINARY_EXPR(node, compositeRow, entireWindow = null) {
        const op = node.operator.toUpperCase();
        const L = this.evaluate(node.left, compositeRow, entireWindow);
        const R = this.evaluate(node.right, compositeRow, entireWindow);
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
            default:
                throw new Error(`ExprEngine: Unsupported binary operator ${op}`);
        }
    }

    UNARY_EXPR(node, compositeRow, entireWindow = null) {
        const op = (node.op || node.operator || '').toUpperCase();
        const v = this.evaluate(node.operand, compositeRow, entireWindow);
        switch (op) {
            case 'NOT': return !Boolean(v);
            case '-': return -v;
            default: throw new Error(`ExprEngine: Unsupported unary operator ${op}`);
        }
    }

    CALL_EXPR(node, compositeRow, entireWindow = null) {
        const name = (node.name || '').toUpperCase();
        const args = (node.arguments || []).map((a) => this.evaluate(a, compositeRow, entireWindow));

        switch (name) {
            case 'LOWER': return String(args[0] ?? '').toLowerCase();
            case 'UPPER': return String(args[0] ?? '').toUpperCase();
            case 'LENGTH': return args[0] == null ? null : String(args[0]).length;
            case 'ABS': return Math.abs(Number(args[0]));
            // JSON functions (Postgres & MySQL variants)
            case 'JSON_OBJECT': {// MySQL: JSON_OBJECT(key1, val1, key2, val2, ...)
                if (args.length % 2 !== 0) throw new Error('JSON_OBJECT requires an even number of arguments');
                const obj = {};
                for (let i = 0; i < args.length; i += 2) {
                    obj[args[i]] = args[i + 1];
                }
                return obj;
            }
            case 'JSON_ARRAY': // MySQL: JSON_ARRAY(val1, val2, ...)
                return args;
            case 'JSON_BUILD_OBJECT': {// Postgres: JSON_BUILD_OBJECT(key1, val1, ...)
                if (args.length % 2 !== 0) throw new Error('JSON_BUILD_OBJECT requires an even number of arguments');
                const buildObj = {};
                for (let i = 0; i < args.length; i += 2) {
                    buildObj[args[i]] = args[i + 1];
                }
                return buildObj;
            }
            case 'JSON_BUILD_ARRAY': // Postgres: JSON_BUILD_ARRAY(val1, ...)
                return args;
            default: throw new Error(`ExprEngine: Unsupported function ${node.name}`);
        }
    }

    AGGR_CALL_EXPR(node, compositeRow, entireWindow = null) {
        const fn = (node.name || '').toUpperCase();
        const args = node.arguments || [];

        // ----------------------

        const group = compositeRow?.[GROUP_SYMBOL] ?? (compositeRow ? [compositeRow] : []);
        const expr = args[0] || null;

        switch (fn) {
            case 'COUNT': {
                if (!expr) return group.length;
                let cnt = 0;
                for (const member of group) {
                    const v = this.evaluate(expr, member, entireWindow);
                    if (v !== null && v !== undefined) cnt++;
                }
                return cnt;
            }
            case 'SUM':
            case 'AVG': {
                if (!expr) return null;
                let sum = 0, cnt = 0;
                for (const member of group) {
                    const v = this.evaluate(expr, member, entireWindow);
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
                    const v = this.evaluate(expr, member, entireWindow);
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
                    arr.push(this.evaluate(expr, member, entireWindow));
                }
                return arr;
            }
            case 'JSON_OBJECT_AGG':
            case 'JSON_OBJECTAGG': {
                // Postgres: JSON_OBJECT_AGG(key, value)
                const keyExpr = args[0], valExpr = args[1];
                if (!keyExpr || !valExpr) return {};
                const obj = {};
                for (const member of group) {
                    const k = this.evaluate(keyExpr, member, entireWindow);
                    const v = this.evaluate(valExpr, member, entireWindow);
                    obj[k] = v;
                }
                return obj;
            }
        }

        // ----------------------

        const rowIndex = entireWindow.indexOf(compositeRow);
        if (rowIndex === -1) throw new Error(`ExprEngine: Row not found in entireWindow`);

        switch (fn) {
            case 'ROW_NUMBER':
                return rowIndex + 1;

            case 'RANK': {
                const orderExpr = args[0];
                if (!orderExpr) throw new Error(`RANK() requires an ORDER BY expression`);
                const values = entireWindow.map(r => this.evaluate(orderExpr, r, entireWindow));
                const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
                const currentVal = this.evaluate(orderExpr, compositeRow, entireWindow);
                return uniqueSorted.indexOf(currentVal) + 1;
            }

            case 'DENSE_RANK': {
                const orderExpr = args[0];
                if (!orderExpr) throw new Error(`DENSE_RANK() requires an ORDER BY expression`);
                const values = entireWindow.map(r => this.evaluate(orderExpr, r, entireWindow));
                const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
                const currentVal = this.evaluate(orderExpr, compositeRow, entireWindow);
                return uniqueSorted.indexOf(currentVal) + 1;
            }

            case 'NTILE': {
                const buckets = Number(this.evaluate(args[0], compositeRow, entireWindow));
                if (!Number.isInteger(buckets) || buckets <= 0) {
                    throw new Error(`NTILE(n) requires a positive integer`);
                }
                const size = Math.ceil(entireWindow.length / buckets);
                return Math.floor(rowIndex / size) + 1;
            }

            case 'LAG': {
                const expr = args[0];
                const offset = Number(args[1]?.value || 1);
                const defaultValue = args[2] ? this.evaluate(args[2], compositeRow, entireWindow) : null;
                const target = entireWindow[rowIndex - offset];
                return target ? this.evaluate(expr, target, entireWindow) : defaultValue;
            }

            case 'LEAD': {
                const expr = args[0];
                const offset = Number(args[1]?.value || 1);
                const defaultValue = args[2] ? this.evaluate(args[2], compositeRow, entireWindow) : null;
                const target = entireWindow[rowIndex + offset];
                return target ? this.evaluate(expr, target, entireWindow) : defaultValue;
            }

            case 'FIRST_VALUE': {
                const expr = args[0];
                return this.evaluate(expr, entireWindow[0], entireWindow);
            }

            case 'LAST_VALUE': {
                const expr = args[0];
                return this.evaluate(expr, entireWindow[entireWindow.length - 1], entireWindow);
            }

            default:
                throw new Error(`ExprEngine: Unsupported window function ${node.name}`);
        }
    }

    COLUMN_REF1(node, compositeRow) {
        if (!node) return undefined;
        const colName = node.delim ? node.value : node.value.toLowerCase();
        const qualifier = node.qualifier || {};
        const qualName = qualifier.delim ? qualifier.value : qualifier.value?.toLowerCase();

        if (qualName) {
            const table = compositeRow[qualName];
            return table ? table[colName] : undefined;
        }
        for (const alias of Object.keys(compositeRow)) {
            const table = compositeRow[alias];
            if (colName in table) return table[colName];
        }
        return undefined;
    }

    STRING_LITERAL(node) { return node.value; }
    NUMBER_LITERAL(node) { return Number(node.value); }
    BOOLEAN_LITERAL(node) { return Boolean(node.value); }
    NULL_LITERAL() { return null; }
}
