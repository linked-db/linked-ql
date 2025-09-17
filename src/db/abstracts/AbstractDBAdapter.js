export class AbstractDBAdapter {
    _parseSchemaSelectors(enums) {
        const [names, _names, patterns, _patterns] = enums.reduce(([names, _names, patterns, _patterns], e) => {
            if (/^!%|^!.+%$/.test(e)) return [names, _names, patterns, _patterns.concat(e.slice(1))];
            if (/^%|%$/.test(e)) return [names, _names, patterns.concat(e), _patterns];
            if (/^!/.test(e)) return [names, _names.concat(e.slice(1)), patterns, _patterns];
            return [names.concat(e), _names, patterns, _patterns];
        }, [[], [], [], []]);
        return [names, _names, patterns, _patterns];
    }

    _matchSelector(ident, enums) {
        const [names, _names, patterns, _patterns] = this._parseSchemaSelectors(enums);
        const $names = names.length ? names.includes(ident) || (names.length === 1 && names[0] === '*') : false;
        const $_names = _names.length ? !_names.includes(ident) : false;
        const $patterns = patterns.length ? patterns.some((s) => (new RegExp(s.replace('%', '.+?')).test(ident))) : false;
        const $_patterns = _patterns.length ? !_patterns.some((s) => (new RegExp(s.replace('%', '.+?')).test(ident))) : false;
        return [$names, $_names, $patterns, $_patterns].some((s) => s);
    }
}