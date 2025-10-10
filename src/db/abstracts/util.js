import { AbstractNode } from '../../lang/abstracts/AbstractNode.js';
import { AbstractNodeList } from '../../lang/abstracts/AbstractNodeList.js';
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

// ------------------------

export function matchExpr(a, b, _op = null) {

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (const [i, _a] of a.entries()) {
            if (!matchExpr(_a, b[i])) return false;
        }
        return true;
    }

    if (!(a instanceof AbstractNode) || !(b instanceof AbstractNode)) {
        return _eq(a, b);
    }

    if (!(a instanceof b.constructor)
        && !(b instanceof a.constructor)) return false;

    if (a instanceof registry.BinaryExpr) {
        const matchOperators = (ops) => [a, b].every((x) => ops.includes(x.operator()));

        let logicalOp;
        if (matchOperators([logicalOp = 'AND'])
            || matchOperators([logicalOp = 'OR'])
            || _op === 'AND~' && (a.operator() === 'AND' || b.operator() === 'AND') && (logicalOp = 'AND')) {
            const aSplit = splitLogicalExpr(a, logicalOp);
            const bSplit = splitLogicalExpr(b, logicalOp);
            return matchLogicalSplits(aSplit, bSplit, _op || logicalOp);
        }

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

    const aKeys = new Set(a._keys().filter((k) => a._get(k) !== undefined));
    const bKeys = new Set(b._keys().filter((k) => b._get(k) !== undefined));
    if (aKeys.size !== bKeys.size) return false;
    for (const k of new Set([...aKeys, ...bKeys])) {
        if (!aKeys.has(k) || !bKeys.has(k)) return false;
        if (!matchExpr(a._get(k), b._get(k))) return false;
    }

    return true;
}

export function matchLogicalSplits(a, b, op = 'AND') {
    if (op === 'OR') {
        for (const [i, _a] of a.entries()) {
            if (!matchExpr(_a, b[i])) return false;
        }
        return true;
    }
    const bSplit = new Set(b);
    top: for (const _a of a) {
        for (const _b of bSplit) {
            if (matchExpr(_a, _b)) {
                bSplit.delete(_b);
                continue top;
            }
        }
        return false;
    }
    if (op === 'AND~') return bSplit;
    return bSplit.size === 0;
}

export function splitLogicalExpr(expr, op = 'AND') {
    if (expr instanceof registry.BinaryExpr
        && expr.operator() === op) {
        const lefts = splitLogicalExpr(expr.left(), op);
        return lefts.concat(expr.right());
    }
    return [expr];
}
