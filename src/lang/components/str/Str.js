import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import AbstractNode from '../../AbstractNode.js';
import Lexer from '../../Lexer.js';

export default class Str extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	QUOTE;
	VALUE = '';
	
	constructor(context, quote = "'") {
		super(context);
		this.QUOTE = quote;
	}
	
	value(expr) { return (this.VALUE = expr, this); }

	toJSON() { return { quote: this.QUOTE, value: (this.VALUE || '') }; }

	static fromJSON(context, json) {
		if (typeof json?.value !== 'string' || !['"', "'"].includes(json.quote)) return;
		return (new this(context, json.quote)).value(json.value);
	}
	
	stringify() { return this.stringifyText(this.VALUE); }
	 
	static parse(context, expr) {
		const [text, quote] = this.parseText(context, expr, true) || [];
		if (quote) return (new this(context, quote)).value(text);
	}
	
	stringifyText(text) {
		const quote = this.QUOTE || this.quoteChars[0];
		return `${ quote }${ ((text || '') + '').replace(new RegExp(quote, 'g'), quote.repeat(2)) }${ quote }`;
	}

	static parseText(context, expr, asInputDialect = false) {
		const quoteChars = this.getQuoteChars(context, asInputDialect), $ = {};
		if (!($.quote = quoteChars.find(q => _wrapped(expr, q, q))) || Lexer.match(expr, [' ']).length) return;
		return [
			_unwrap(expr, $.quote, $.quote).replace(new RegExp($.quote + $.quote, 'g'), $.quote),
			$.quote
		];
	}
}
