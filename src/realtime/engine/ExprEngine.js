import { _eq } from '../../lang/util.js';

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

    evaluate(node, compositeRow) {
        if (!node) return null;
        if (!node.nodeName && node.left) {
            node.nodeName = 'BINARY_EXPR';
        }
        const handler = this[node.nodeName];
        if (!handler) {
            throw new Error(`ExprEngine: Unsupported AST node: ${node.nodeName}`);
        }
        return handler.call(this, node, compositeRow);
    }

    ON_CLAUSE(node, compositeRow) {
        return this.evaluate(node.expr, compositeRow);
    }

    USING_CLAUSE(node, compositeRow) {
        const leftTableAlias = Object.keys(compositeRow)[0];
        const rightTableAlias = Object.keys(compositeRow)[1];
        if (!leftTableAlias || !rightTableAlias) {
            return false;
        }
        const cols = Array.isArray(node.column.entries) ? node.column.entries : [node.column];
        return cols.every((col) => compositeRow[leftTableAlias][col.value] === compositeRow[rightTableAlias][col.value]);
    }

    BINARY_EXPR(node, compositeRow) {
        const L = this.evaluate(node.left, compositeRow);
        const R = this.evaluate(node.right, compositeRow);
        const op = node.operator.toUpperCase();

        if (L == null || R == null) {
            if (op === 'IS') return L === R;
            if (op === 'IS NOT') return L !== R;
        }

        switch (op) {
            case '=':
            case '==':
                return _eq(L, R);
            case '<>':
            case '!=':
                return !_eq(L, R);
            case '<':
                return L < R;
            case '<=':
                return L <= R;
            case '>':
                return L > R;
            case '>=':
                return L >= R;
            case 'AND':
                return Boolean(L) && Boolean(R);
            case 'OR':
                return Boolean(L) || Boolean(R);
            case 'LIKE':
                return likeCompare(String(L), String(R));
            case 'IN':
                return Array.isArray(R) && R.some((v) => _eq(L, v));
            default:
                throw new Error(`ExprEngine: Unsupported binary operator ${op}`);
        }
    }

    UNARY_EXPR(node, compositeRow) {
        const op = (node.op || node.operator || '').toUpperCase();
        const v = this.evaluate(node.operand, compositeRow);
        switch (op) {
            case 'NOT': return !Boolean(v);
            case '-': return -v;
            default: throw new Error(`ExprEngine: Unsupported unary operator ${op}`);
        }
    }

    FUNC_CALL(node, compositeRow) {
        const name = (node.name || '').toUpperCase();
        const args = (node.args || []).map(a => this.evaluate(a, compositeRow));
        switch (name) {
            case 'LOWER': return String(args[0] ?? '').toLowerCase();
            case 'UPPER': return String(args[0] ?? '').toUpperCase();
            case 'LENGTH': return args[0] == null ? null : String(args[0]).length;
            case 'ABS': return Math.abs(Number(args[0]));
            default: throw new Error(`ExprEngine: Unsupported function ${node.name}`);
        }
    }

    COLUMN_REF1(node, compositeRow) {
        if (!node) return undefined;
        const colName = node.delim ? node.value : node.value.toLowerCase();
        const qualifier = node.qualifier || {};
        const qualName = qualifier.delim ? qualifier.value : qualifier.value?.toLowerCase();
        if (qualName) {
            const table = compositeRow[qualName];
            if (!table) return undefined;
            return table[colName];
        }
        for (const alias of Object.keys(compositeRow)) {
            const table = compositeRow[alias];
            if (colName in table) {
                return table[colName];
            }
        }
        return undefined;
    }

    STRING_LITERAL(node) { return node.value; }

    NUMBER_LITERAL(node) { return Number(node.value); }

    BOOLEAN_LITERAL(node) { return Boolean(node.value); }

    NULL_LITERAL() { return null; }
}