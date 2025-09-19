export function parseSchemaSelectors(enums) {
    const [names, _names, patterns, _patterns] = enums.reduce(([names, _names, patterns, _patterns], e) => {
        if (/^!%|^!.+%$/.test(e)) return [names, _names, patterns, _patterns.concat(e.slice(1))];
        if (/^%|%$/.test(e)) return [names, _names, patterns.concat(e), _patterns];
        if (/^!/.test(e)) return [names, _names.concat(e.slice(1)), patterns, _patterns];
        return [names.concat(e), _names, patterns, _patterns];
    }, [[], [], [], []]);
    return [names, _names, patterns, _patterns];
}

export function matchSelector(ident, enums) {
    const [names, _names, patterns, _patterns] = parseSchemaSelectors(enums);
    const $names = names.length ? names.includes(ident) || (names.length === 1 && names[0] === '*') : false;
    const $_names = _names.length ? !_names.includes(ident) : false;
    const $patterns = patterns.length ? patterns.some((s) => (new RegExp(s.replace('%', '.+?')).test(ident))) : false;
    const $_patterns = _patterns.length ? !_patterns.some((s) => (new RegExp(s.replace('%', '.+?')).test(ident))) : false;
    return [$names, $_names, $patterns, $_patterns].some((s) => s);
}

export function normalizeSelectorArg(selector, flatten = false) {
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

export function normalizeQueryArgs(...args) {
    let query, options = {};
    if (typeof args[0] === 'object' && args[0] && args[0].query) {
        ({ query, ...options } = args[0]);
    } else {
        query = args.shift();
        if (Array.isArray(args[0])) {
            options.values = args.shift();
        }
        if (typeof args[0] === 'object' && args[0]) {
            options = { ...options, ...args.shift() };
        }
    }
    return [query, options];
}