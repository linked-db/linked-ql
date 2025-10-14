import { _eq } from '../../lang/abstracts/util.js';
import { registry } from '../../lang/registry.js';

const GROUPING_META = Symbol.for('grouping_meta');
const WINDOW_META = Symbol.for('window_meta');

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

    async BIND_VAR(node, compositeRow, queryCtx = {}) {
        if (!Array.isArray(queryCtx.options.values))
            throw new Error(`there is no parameter ${node}`);
        const value = Number(node.value());
        if (queryCtx.options.values.length < value)
            throw new Error(`there is no parameter ${node}`);
        return queryCtx.options.values[value - 1];
    }

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

    async CAST_EXPR(node, compositeRow, queryCtx = {}) {
        return await this._CAST_EXPR(node.expr(), node.dataType(), compositeRow, queryCtx);
    }

    async PG_CAST_EXPR2(node, compositeRow, queryCtx = {}) {
        return await this._CAST_EXPR(node.left(), node.right(), compositeRow, queryCtx);
    }

    async _CAST_EXPR(expr, dataType, compositeRow, queryCtx = {}) {
        const L = await this.evaluateToScalar(expr, compositeRow, queryCtx);
        const DT = dataType.value();
        switch (DT) {
            case 'INT': return parseInt(L);
            case 'TEXT': return String(L);
            case 'BOOLEAN': return Boolean(L);
            default: return L;
        }
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
            
            // JSON
            case '->':
            case '->>': {
                // JSON path accessors
                if (L == null) return null;
                let val;
                if (typeof R === 'number') {
                    val = Array.isArray(L) ? L[R] : undefined;
                } else if (typeof R === 'string') {
                    if (typeof L === 'object' && !Array.isArray(L)) val = L[R];
                    else if (Array.isArray(L) && !isNaN(R)) val = L[Number(R)];
                }
                return op === '->' ? val : (val == null ? null : String(val));
            }
            case '#>':
            case '#>>': {
                // JSON path extraction (Postgres)
                // L #> R, where R is array of keys
                if (L == null || !Array.isArray(R)) return null;
                let val = L;
                for (const key of R) {
                    if (val == null) return null;
                    if (Array.isArray(val) && !isNaN(key)) val = val[Number(key)];
                    else if (typeof val === 'object') val = val[key];
                    else return null;
                }
                return op === '#>' ? val : (val == null ? null : String(val));
            }
            case '@>': {
                // JSON contains (Postgres)
                if (L == null || R == null) return false;
                if (typeof L !== 'object' || typeof R !== 'object') return false;
                // Simple deep contains check
                const contains = (a, b) => {
                    if (typeof b !== 'object' || b == null) return a === b;
                    if (Array.isArray(b)) {
                        if (!Array.isArray(a)) return false;
                        return b.every((v, i) => contains(a[i], v));
                    }
                    return Object.keys(b).every((k) => contains(a[k], b[k]));
                };
                return contains(L, R);
            }
            case '<@': {
                // JSON is contained by (Postgres)
                if (L == null || R == null) return false;
                if (typeof L !== 'object' || typeof R !== 'object') return false;
                // Simple deep contains check
                const contains = (a, b) => {
                    if (typeof b !== 'object' || b == null) return a === b;
                    if (Array.isArray(b)) {
                        if (!Array.isArray(a)) return false;
                        return b.every((v, i) => contains(a[i], v));
                    }
                    return Object.keys(b).every((k) => contains(a[k], b[k]));
                };
                return contains(R, L);
            }
            case '?': {
                // JSON key exists (Postgres)
                if (L == null || typeof L !== 'object') return false;
                if (Array.isArray(L)) return L.includes(R);
                return Object.prototype.hasOwnProperty.call(L, R);
            }
            case '?|': {
                // JSON key exists any (Postgres)
                if (L == null || typeof L !== 'object' || !Array.isArray(R)) return false;
                if (Array.isArray(L)) return R.some((key) => L.includes(key));
                return R.some((key) => Object.prototype.hasOwnProperty.call(L, key));
            }
            case '?&': {
                // JSON key exists all (Postgres)
                if (L == null || typeof L !== 'object' || !Array.isArray(R)) return false;
                if (Array.isArray(L)) return R.every((key) => L.includes(key));
                return R.every((key) => Object.prototype.hasOwnProperty.call(L, key));
            }

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
        const fn = node.name().toUpperCase();

        // SRFs

        if (fn === 'UNNEST' || fn === 'GENERATE_SERIES') {
            const args = await Promise.all(node.arguments().map((a) => this.evaluate(a, compositeRow, queryCtx)));

            return (function* () {
                if (fn === 'UNNEST') {
                    for (let i = 0; i < args[0].length; i++) yield args.map((arr) => arr[i] ?? null);
                }

                if (fn === 'GENERATE_SERIES') {
                    for (let x = args[0]; x <= args[1]; x += args[2] ?? 1) yield [x];
                }
            })();
        }

        // Meta functions

        if (fn === 'GROUPING' || fn === 'GROUPING_ID') {
            const meta = compositeRow[GROUPING_META];
            if (!meta) throw new Error(`${fn}() called outside of grouping pipeline`);

            const args = node.arguments();

            const getBit = (arg) => {
                const bitIndex = meta.exprIndex.get(arg);
                if (bitIndex !== undefined) return (meta.groupingId >> bitIndex) & 1;

                if (!(arg instanceof registry.ColumnRef1)) {
                    throw new Error(`${fn}() argument must be a grouping column reference`);
                }
                const alias = arg.qualifier()?.value() || '';
                const colName = arg.value();
                return meta.groupingColumnsMap.get(alias)?.has(colName) ? 0 : 1;
            };

            // Fast path for GROUPING_ID when args match all top-level grouping expressions
            if (fn === 'GROUPING_ID' &&
                args.length === meta.exprIndex.size &&
                args.every((arg, i) => meta.exprIndex.has(arg) && meta.exprIndex.get(arg) === i)
            ) {
                return meta.groupingId;
            }

            // Compute mask manually
            let mask = 0;
            for (let i = 0; i < args.length; i++) {
                const bit = getBit(args[i]);
                if (fn === 'GROUPING') return bit; // early return for single-bit GROUPING
                mask = (mask << 1) | bit;
            }

            return mask;
        }

        if (fn === 'VALUES'/* MySQL */
            && compositeRow.EXCLUDED
            && typeof compositeRow.EXCLUDED === 'object') {

            const args = node.arguments();
            const fieldName = args[0].value();

            return compositeRow.EXCLUDED[fieldName];
        }

        // Classic functions

        const args = await Promise.all(node.arguments().map((a) => this.evaluate(a, compositeRow, queryCtx)));

        switch (fn) {
            case 'LOWER': return String(args[0] ?? '').toLowerCase();

            case 'UPPER': return String(args[0] ?? '').toUpperCase();

            case 'LENGTH': return args[0] == null ? null : String(args[0]).length;

            case 'ABS': return Math.abs(Number(args[0]));

            case 'COALESCE': return args.reduce((prev, cur) => prev !== null ? prev : cur, null);

            case 'NULLIF': return _eq(args[0], args[1]) ? null : args[0];

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

        let metaData;

        if (node.overClause()) {
            const meta = compositeRow[WINDOW_META];
            if (!meta) throw new Error(`${node} called outside of window processing pipeline (1)`);
            if (!node.winHash) throw new Error(`${node} called outside of window processing pipeline (2)`);
            if (!meta[node.winHash]) throw new Error(`${node} called outside of window processing pipeline (3)`);
            metaData = meta[node.winHash];
        } else {
            const meta = compositeRow[GROUPING_META];
            if (!meta) throw new Error('GROUPING() called outside of grouping pipeline');
            metaData = meta;
        }

        const { window, frameStart, frameEnd, offset = 0 } = metaData;
        const fn = node.name().toUpperCase();
        const args = node.arguments();
        const expr = args[0] || null;

        switch (fn) {
            case 'COUNT': {
                if (!expr || expr instanceof registry.ColumnRef0) {
                    return frameEnd - frameStart + 1;
                }
                let cnt = 0;
                for (let j = frameStart; j <= frameEnd; j++) {
                    const entry = window[j];
                    const v = await this.evaluate(expr, entry, queryCtx);
                    if (v !== null && v !== undefined) cnt++;
                }
                return cnt;
            }

            case 'SUM':
            case 'AVG': {
                if (!expr) return null;
                let sum = 0, cnt = 0;
                for (let j = frameStart; j <= frameEnd; j++) {
                    const entry = window[j];
                    const v = await this.evaluate(expr, entry, queryCtx);
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
                for (let j = frameStart; j <= frameEnd; j++) {
                    const entry = window[j];
                    const v = await this.evaluate(expr, entry, queryCtx);
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

            case 'JSON_AGG':
            case 'JSON_ARRAYAGG': {

                if (!expr) return [];
                const arr = [];

                for (let j = frameStart; j <= frameEnd; j++) {
                    const entry = window[j];
                    arr.push(await this.evaluate(expr, entry, queryCtx));
                }
                return arr;
            }

            case 'JSON_OBJECT_AGG':
            case 'JSON_OBJECTAGG': {

                const keyExpr = args[0], valExpr = args[1];
                if (!keyExpr || !valExpr) return {};
                const obj = Object.create(null);

                for (let j = frameStart; j <= frameEnd; j++) {
                    const entry = window[j];
                    const k = await this.evaluate(keyExpr, entry, queryCtx);
                    const v = await this.evaluate(valExpr, entry, queryCtx);
                    obj[k] = v;
                }
                return obj;
            }

            case 'STRING_AGG': {

                const expr = args[0];
                const delimiter = args[1] ? await this.evaluate(args[1], compositeRow, queryCtx) : ',';
                const arr = [];

                for (let j = frameStart; j <= frameEnd; j++) {
                    const v = await this.evaluate(expr, window[j], queryCtx);
                    if (v != null) arr.push(String(v));
                }
                return arr.join(delimiter);
            }

            case 'ARRAY_AGG': {
                const expr = args[0];
                const arr = [];
                for (let j = frameStart; j <= frameEnd; j++) {
                    arr.push(await this.evaluate(expr, window[j], queryCtx));
                }
                return arr;
            }

            case 'BIT_AND': {
                const expr = args[0];
                let result = ~0; // all bits set
                for (let j = frameStart; j <= frameEnd; j++) {
                    const v = await this.evaluate(expr, window[j], queryCtx);
                    if (v != null) result &= Number(v);
                }
                return result;
            }

            case 'BIT_OR': {
                const expr = args[0];
                let result = 0;
                for (let j = frameStart; j <= frameEnd; j++) {
                    const v = await this.evaluate(expr, window[j], queryCtx);
                    if (v != null) result |= Number(v);
                }
                return result;
            }

            case 'BOOL_AND': {
                const expr = args[0];
                for (let j = frameStart; j <= frameEnd; j++) {
                    const v = await this.evaluate(expr, window[j], queryCtx);
                    if (!v) return false;
                }
                return true;
            }

            case 'BOOL_OR': {
                const expr = args[0];
                for (let j = frameStart; j <= frameEnd; j++) {
                    const v = await this.evaluate(expr, window[j], queryCtx);
                    if (v) return true;
                }
                return false;
            }

            // -------- Window function proper

            case 'ROW_NUMBER':
                return offset + 1;

            case 'RANK':
            case 'PERCENT_RANK': {
                const myKeysHash = metaData.orderKeysHash;
                let rank;
                // find first peer group member
                for (let i = 0; i <= offset; i++) {
                    const otherKeysHash = window[i][WINDOW_META][node.winHash].orderKeysHash;
                    if (myKeysHash === otherKeysHash) {
                        rank = i + 1; // 1-based
                        break;
                    }
                }
                if (fn === 'RANK') return rank;
                // PERCENT_RANK
                const total = window.length;
                return total === 1 ? 0 : (rank - 1) / (total - 1);
            }

            case 'DENSE_RANK': {
                const seen = new Set();
                for (let i = 0; i <= offset; i++) {
                    const otherKeysHash = window[i][WINDOW_META][node.winHash].orderKeysHash;
                    if (!seen.has(otherKeysHash)) {
                        seen.add(otherKeysHash);
                    }
                }
                return seen.size;
            }

            case 'NTILE': {
                const buckets = Number(await this.evaluateToScalar(args[0], compositeRow, queryCtx));
                if (!Number.isInteger(buckets) || buckets <= 0) {
                    throw new Error(`[${node}] NTILE(n) requires a positive integer`);
                }
                const total = window.length;
                const baseSize = Math.floor(total / buckets);
                const remainder = total % buckets;
                // bucket boundaries
                let threshold = 0;
                for (let b = 1; b <= buckets; b++) {
                    const bucketSize = baseSize + (b <= remainder ? 1 : 0);
                    if (offset < threshold + bucketSize) {
                        return b;
                    }
                    threshold += bucketSize;
                }
            }

            case 'CUME_DIST': {
                const total = window.length;
                const myKeysHash = metaData.orderKeysHash;
                let lastIndex = offset;
                for (let i = offset + 1; i < total; i++) {
                    const otherKeysHash = window[i][WINDOW_META][node.winHash].orderKeysHash;
                    if (otherKeysHash === myKeysHash) lastIndex = i;
                    else break;
                }
                return (lastIndex + 1) / total;
            }

            case 'LAG': {
                const expr = args[0];
                const lagBy = Number(await this.evaluate(args[1] ?? { value: 1 }, compositeRow, queryCtx));
                const defaultValue = args[2] ? await this.evaluate(args[2], compositeRow, queryCtx) : null;
                const targetIndex = offset - lagBy;
                return targetIndex >= 0 ? await this.evaluate(expr, window[targetIndex], queryCtx) : defaultValue;
            }

            case 'LEAD': {
                const expr = args[0];
                const leadBy = Number(await this.evaluate(args[1] ?? { value: 1 }, compositeRow, queryCtx));
                const defaultValue = args[2] ? await this.evaluate(args[2], compositeRow, queryCtx) : null;
                const targetIndex = offset + leadBy;
                return targetIndex < window.length ? await this.evaluate(expr, window[targetIndex], queryCtx) : defaultValue;
            }

            case 'FIRST_VALUE': {
                const expr = args[0];
                return await this.evaluate(expr, window[frameStart], queryCtx);
            }

            case 'LAST_VALUE': {
                const expr = args[0];
                return await this.evaluate(expr, window[frameEnd], queryCtx);
            }

            case 'NTH_VALUE': {
                const expr = args[0];
                const n = Number(await this.evaluateToScalar(args[1], compositeRow, queryCtx));
                if (!Number.isInteger(n) || n <= 0) {
                    throw new Error(`[${node}] NTH_VALUE(n) requires a positive integer`);
                }
                const targetIndex = frameStart + (n - 1);
                if (targetIndex > frameEnd) return null;
                return await this.evaluate(expr, window[targetIndex], queryCtx);
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

    async DEFAULT_LITERAL(node) { return null; }
    async STRING_LITERAL(node) { return node.value(); }
    async NUMBER_LITERAL(node) { return Number(node.value()); }
    async BOOL_LITERAL(node) { return Boolean(node.value()); }
    async NULL_LITERAL() { return null; }

    // -------------

    resolveScopedRefsInClause(clause, selectList) {
        return clause.entries().map((entry) => {
            let refedExpr;
            if (entry.expr() instanceof registry.NumberLiteral) {
                if (!(refedExpr = selectList.entries()[parseInt(entry.expr().value()) - 1]?.expr())) {
                    throw new Error(`[${clause}] The reference by offset ${entry.expr().value()} does not resolve to a select list entry`);
                }
            } else if (entry.expr()?.resolution?.() === 'scope') {
                refedExpr = selectList.entries().find((si, i) => si.alias()?.identifiesAs(entry.expr()))?.expr();
            }
            if (refedExpr) {
                entry = entry.constructor.fromJSON({ ...entry.jsonfy(), expr: refedExpr.jsonfy() }, { assert: true });
                clause._adoptNodes(entry);
            }
            return entry;
        });
    }

    applySorting(decorated, orderElements, queryCtx = {}) {
        // Sort synchronously
        decorated.sort((a, b) => {
            for (let i = 0; i < orderElements.length; i++) {
                const idDesc = orderElements[i].dir() === 'DESC';
                const dir = idDesc ? -1 : 1;
                const nullsSpec = orderElements[i].nullsSpec()
                    || (queryCtx.options?.dialect === 'mysql' ? (idDesc ? 'LAST' : 'FIRST') : (idDesc ? 'FIRST' : 'LAST'));

                const valA = a.keys[i];
                const valB = b.keys[i];
                const aIsNull = valA === null; // Explicit NULL check
                const bIsNull = valB === null;

                // 1. Handle NULL vs. NULL (Always equal)
                if (aIsNull && bIsNull) continue; // Move to next order element

                // 2. Handle NULL vs. Non-NULL
                if (aIsNull || bIsNull) {
                    // Determine the NULLs order required by the SQL dialect/spec
                    // If NULLS FIRST:
                    //   - A is NULL, B is NOT: A comes first (return -1)
                    //   - B is NULL, A is NOT: B comes first (return 1)
                    if (nullsSpec === 'FIRST') {
                        if (aIsNull) return -1; // A comes first
                        if (bIsNull) return 1;  // A comes after B
                    }
                    // If NULLS LAST:
                    //   - A is NULL, B is NOT: A comes last (return 1)
                    //   - B is NULL, A is NOT: B comes last (return -1)
                    else { // NULLS LAST
                        if (aIsNull) return 1;  // A comes after B
                        if (bIsNull) return -1; // A comes before B
                    }
                }

                // 3. Handle Non-NULL vs. Non-NULL (Original logic)
                // Ensure comparison is safe for potentially non-numeric/string values if needed
                if (valA < valB) return -dir;
                if (valA > valB) return dir;
            }
            return 0;
        });
    }
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