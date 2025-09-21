import { _eq } from '../../lang/util.js';

export function normalizeSchemaSelectorArg(selector, flatten = false) {
    if (selector === '*') {
        selector = { ['*']: ['*'] };
    } else if (Array.isArray(selector) && selector.length) {
        selector = selector.reduce((ss, s, i) => {
            let keys;
            if (!(typeof s === 'object' && s)
                || !(keys = Object.keys(s)).length
                || keys.filter((k) => k !== 'schema' && k !== 'tables').length) {
                throw new SyntaxError(`Given selector ${JSON.stringify(selector)} invalid at index ${i}`);
            }
            const schema = s.schema || '*';
            const tables = s.tables || '*';
            return { ...ss, [schema]: [...new Set((ss[schema] || []).concat(tables))] };
        }, {});
    } else if (typeof selector === 'object' && selector && Object.keys(selector).length) {
        selector = Object.fromEntries(Object.entries(selector).map(([k, v]) => [k, [].concat(v)]));
    } else {
        throw new SyntaxError(`Given selector ${JSON.stringify(selector)} invalid`);
    }
    if (flatten) {
        selector = new Set(Object.entries(selector).reduce((all, [schema, tables]) => {
            return all.concat([].concat(tables).map((table) => JSON.stringify([schema, table])));
        }, []));
    }
    return selector;
}

export function parseSchemaSelectors(enums) {
    const [names, _names, patterns, _patterns] = enums.reduce(([names, _names, patterns, _patterns], e) => {
        if (/^!%|^!.+%$/.test(e)) return [names, _names, patterns, _patterns.concat(e.slice(1))];
        if (/^%|%$/.test(e)) return [names, _names, patterns.concat(e), _patterns];
        if (/^!/.test(e)) return [names, _names.concat(e.slice(1)), patterns, _patterns];
        return [names.concat(e), _names, patterns, _patterns];
    }, [[], [], [], []]);
    return [names, _names, patterns, _patterns];
}

export function matchSchemaSelector(ident, enums) {
    const [names, _names, patterns, _patterns] = parseSchemaSelectors(enums);
    const $names = names.length ? names.includes(ident) || (names.length === 1 && names[0] === '*') : false;
    const $_names = _names.length ? !_names.includes(ident) : false;
    const $patterns = patterns.length ? patterns.some((s) => (new RegExp(s.replace('%', '.+?')).test(ident))) : false;
    const $_patterns = _patterns.length ? !_patterns.some((s) => (new RegExp(s.replace('%', '.+?')).test(ident))) : false;
    return [$names, $_names, $patterns, $_patterns].some((s) => s);
}

// ------------------------

export function normalizeQueryArgs(...args) {
    let withCallback, query, callback, options = {};
    if (typeof args[0] === 'boolean') {
        withCallback = args.shift();
    }
    if (typeof args[0] === 'object' && args[0] && args[0].query) {
        if (withCallback) {
            ({ query, callback, ...options } = args[0]);
        } else {
            ({ query, ...options } = args[0]);
        }
    } else {
        query = args.shift();
        if (Array.isArray(args[0])) {
            options.values = args.shift();
        }
        if (withCallback && typeof args[0] === 'function') {
            callback = args.shift();
        }
        if (typeof args[0] === 'object' && args[0]) {
            options = { ...options, ...args.shift() };
        }
    }
    if (withCallback) {
        return [query, callback, options];
    }
    return [query, options];
}

export function scanQuery(query, withMeta = false) {
    const [fromItemsByAlias, fromItemsBySchema, meta] = [{}, {}, {}];
    for (const fromItem of query.from_clause.entries.concat(query.join_clauses || [])) {
        // Aliases are expected - except for a FROM (subquery) scenario, where it's optional
        const alias = fromItem.alias?.delim ? fromItem.alias.value : (fromItem.alias?.value.toLowerCase() || '');
        if (fromItem.expr.nodeName === 'TABLE_REF1') {
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
    if (!withMeta) return [fromItemsByAlias, fromItemsBySchema];
    for (const clause of ['select_list', 'where_clause', 'order_by_clause']) {
        if (query[clause] && scanExpr(query[clause], 'SCALAR_SUBQUERY')) {
            meta.hasScalarSubquery = true;
            break;
        }
    }
    if (query.group_by_clause?.entries.length) {
        meta.hasAggrFunctions = true;
    } else {
        for (const clause of ['select_list', 'where_clause', 'order_by_clause']) {
            if (query[clause] && scanExpr(query[clause], 'AGGR_CALL_EXPR')) {
                meta.hasAggrFunctions = true;
                break;
            }
        }
    }
    if (query.offset_clause?.expr) {
        meta.hasOffset = true;
    }
    if (query.limit_clause?.expr) {
        meta.hasLimit = true;
    }
    return [fromItemsByAlias, fromItemsBySchema, meta];
}

export function splitLogicalExpr(expr) {
    if (expr.nodeName === 'BINARY_EXPR') {
        if (expr.operator === 'OR') return null;
        if (expr.operator === 'AND') {
            const right = splitLogicalExpr(expr.right);
            if (!right) return null;
            return [expr.left].concat(right);
        }
    }
    return [expr];
}

export function matchLogicalExprs(a, b) {
    const _filters = new Set(b);
    top: for (const _a of a) {
        for (const _b of b) {
            if (matchExpr(_a, _b)) {
                _filters.delete(_b);
                continue top;
            }
        }
        return null;
    }
    return _filters;
}

export function matchExpr(a, b) {
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
}

export function scanExpr(nodeJson, search) {
    for (const k of Object.keys(nodeJson)) {
        if (!Array.isArray(nodeJson[k])
            && !(typeof nodeJson[k] === 'object' && nodeJson[k])) continue;
        if (nodeJson[k].nodeName === search
            || scanExpr(nodeJson[k], 'AGGR_CALL_EXPR')) {
            return true;
        }
    }
}
