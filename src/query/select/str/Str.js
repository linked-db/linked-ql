
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import Lexer from '../../Lexer.js';
import Node from '../../abstracts/Node.js';

export default class Str extends Node {
	
	/**
	 * Instance properties
	 */
	VALUE = '';
	QUOTE = '';

	/**
	 * @constructor
	 */
	constructor(context, expr, quote = "'") {
		super(context);
		this.VALUE = expr;
		this.QUOTE = quote;
	}

	/**
	 * Sets the value
	 * 
	 * @param String expr 
	 */
	literal(expr) { this.VALUE = expr; }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const quote = this.QUOTE || this.quoteChars[0];
		return `${ quote }${ this.VALUE.replace(new RegExp(quote, 'g'), quote.repeat(2)) }${ quote }`;
	}

	/**
	 * @inheritdoc
	 */
	toJson() { return { value: this.VALUE }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.value !== 'string') return;
		return new this(context, json.value, json.quote);
	}
	 
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [text, quote] = this.parseText(context, expr, true) || [];
		if (!quote) return;
		return new this(
			context,
			text,
			quote
		);
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
