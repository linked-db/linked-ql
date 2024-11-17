import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import { AbstractNode } from '../../AbstractNode.js';
import { Lexer } from '../../Lexer.js';

export class Str extends AbstractNode {
	
	#value = '';
	#quote = "'";
	
	value(value) {
		if (!arguments.length) return this.#value;
		if (typeof value !== 'string') throw new Error(`Invalid argument as string: ${ value }`);
		return (this.#value = value, this);
	}
	
	quote(value = this.#quote) {
		if (!arguments.length) return this.#quote;
		if (!['"', "'"].includes(value)) throw new Error(`Invalid argument as quote: ${ value }`);
		return (this.#quote = value, this);
	}

	identifiesAs(value) {
		if (typeof value === 'string') return this.$eq(this.#value, value, 'ci');
		return super.identifiesAs(value);
	}

	static get expose() {
		return {
			'string|str': (context, value, quote) => this.fromJSON(context, { value, quote }),
			value: (context, value) => typeof value === 'string' && this.fromJSON(context, { value })
		};
	}

	static fromJSON(context, json, callback = null) {
		if (typeof json?.value !== 'string' || Object.keys(json).filter((k) => !['nodeName', 'value', 'quote'].includes(k)).length || (json.quote && !['"', "'"].includes(json.quote))) return;
		return super.fromJSON(context, json, (instance) => {
			instance.value(json.value).quote(json.quote);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			quote: this.#quote,
			value: this.#value,
			...jsonIn,
		});
    }
	 
	static parse(context, expr) {
		const [text, quote] = this.parseString(context, expr, true) || [];
		if (quote) return (new this(context)).value(text).quote(quote);
	}
	
	stringify() { return this.stringifyString(this.#value, true); }
}
