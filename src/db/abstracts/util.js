import { _eq } from '../../lang/abstracts/util.js';
import { registry } from '../../lang/registry.js';

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
    let query, options = {};
    if (typeof args[0] === 'object' && args[0] && args[0].text) {
        ({ text: query, ...options } = args[0]);
    } else {
        query = args.shift();
        if (Array.isArray(args[0])) {
            options.values = args.shift();
        }
        if (typeof args[0] === 'function') {
            options.callback = args.shift();
        }
        if (typeof args[0] === 'object' && args[0]) {
            options = { ...options, ...args.shift() };
        }
    }
    return [query, options];
}

export function splitLogicalExpr(expr) {
    if (expr instanceof registry.BinaryExpr) {
        if (expr.operator() === 'OR') return null;
        if (expr.operator() === 'AND') {
            const right = splitLogicalExpr(expr.right());
            if (!right) return null;
            return [expr.left()].concat(right);
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
    if (!(a instanceof b.constructor)
        && !(b instanceof a.constructor)) return false;
    if (a instanceof registry.BinaryExpr) {
        const matchOperators = (ops) => [a, b].every((x) => ops.includes(x.operator()));
        if (matchOperators(['=', '=='])
            || matchOperators(['!=', '<>'])
            || (a.operator() === b.operator() && ['IS', 'IS NOT', 'DISTINCT FROM'].includes(a.operator()))) {
            return matchExpr(a.left(), b.left()) && matchExpr(a.right(), b.right())
                || matchExpr(a.right(), b.left()) && matchExpr(a.left(), b.right());
        }
        if (a.operator() === '<' && b.operator() === '>'
            || a.operator() === '<=' && b.operator() === '>='
            || a.operator() === '>' && b.operator() === '<'
            || a.operator() === '>=' && b.operator() === '<=') {
            return matchExpr(a.right(), b.left()) && matchExpr(a.left(), b.right());
        }
    }
    return _eq(a.jsonfy(), b.jsonfy());
}
