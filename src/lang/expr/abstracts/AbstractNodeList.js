import { Lexer } from '../../Lexer.js';
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import { AbstractNode } from '../../AbstractNode.js';

export class AbstractNodeList extends AbstractNode {
    static get EXPECTED_TYPES() { return []; }
    static get TAGS() { return []; }

    #entries = [];
    
    [ Symbol.iterator ]() { return this.#entries[ Symbol.iterator ](); }
    
    get length() { return this.#entries.length; }

    entries() { return this.#entries.slice(); }

    add(...args) {
        this.#entries = this.$castInputs(
            args, 
            this.constructor.EXPECTED_TYPES, 
            this.#entries,
            'add',
            this.constructor.ARGS_DELEGATION,
        );
        return this;
    }

    has(ref) { return !!this.get(ref); }

    get(ref) {
        if (typeof ref === 'number') return this.#entries[ref];
        return this.#entries.find(e => e.identifiesAs(ref));
    }

    static fromJSON(context, json, callback = null) {
        if (!Array.isArray(json?.entries)) return;
		return super.fromJSON(context, json, (instance) => {
            for (const entry of json.entries) { instance.add(entry); }
			callback?.(instance);
		});
	}

    jsonfy(options = {}, jsonIn = {}, reducer = null) {
		return super.jsonfy(options, {
            entries: this.#entries.reduce((aggr, entry, i) => {
                if (reducer) {
                    const result = reducer(entry, i);
                    if (!result) return aggr;
                    if (![entry, true].includes(result)) {
                        if (result instanceof AbstractNode) throw new Error(`A JSON object not a node instance expected from reducer`);
                        return aggr.concat(result);
                    }
                }
                return aggr.concat(entry.jsonfy(options));
            }, []),
            ...jsonIn
		});
    }

    static parse(context, expr, parseCallback) {
        if (this.CLAUSE) {
            const [ clauseMatch, spec ] = expr.match(new RegExp(`^${ this.CLAUSE }([\\s\\S]*)$`, 'i')) || [];
            if (!clauseMatch) return;
            expr = spec.trim();
        }
        if (this.TAGS.length) {
            if (!_wrapped(expr, ...this.TAGS) || Lexer.split(expr, [' ']).length > 1) return;
            expr = _unwrap(expr, ...this.TAGS);
        }
        const $entries = Lexer.split(expr, [',']);
        if (this.MIN_ENTRIES && $entries.length < this.MIN_ENTRIES) return;
        const instance = new this(context);
        const entries = $entries.map(entry => parseCallback(instance, entry.trim(), this.EXPECTED_TYPES)).filter(s => s);
        for (const entry of entries) { instance.add(entry); }
		return instance;
    }

    stringify() {
        let str = this.#entries.join(', ');
        if (this.constructor.CLAUSE) {
            // e.g. SET|RETURNING|WINDOW
            if (!this.#entries.length) return '';
            str = `\n${this.constructor.CLAUSE} ${str}`;
        } else if (this.constructor.TAGS.length) {
            // E.g. Columns/Values/JsonArray/JsonObject Spec Tags: ()
            str = this.constructor.TAGS.join(str);
        }
        return str;
    }
}