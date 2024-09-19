import { _wrapped } from '@webqit/util/str/index.js';
import { _isObject } from '@webqit/util/js/index.js';
import AbstractNode from '../AbstractNode.js';
import Lexer from '../Lexer.js';

export default class Literal extends AbstractNode {

	/**
	 * Instance properties
	 */
	INPUT;
	
	true() { return (this.INPUT = true, this); }
	
	false() { return (this.INPUT = false, this); }
	
	null() { return (this.INPUT = null, this); }
	
	literal(input) { return (this.INPUT = input, this); }

	toJSON() { return { input: this.INPUT }; }

	static fromJSON(context, json) {
		if (typeof json?.input === 'undefined') return;
		return (new this(context)).literal(json.input);
	}

	stringify() {
		if (_isObject(this.INPUT) || Array.isArray(this.INPUT)) return JSON.stringify(this.INPUT);
		return `${ this.INPUT }`;
	}
	
	static parse(context, expr) {
		const instance = new this(context);
		if (/^TRUE$/i.test(expr)) return instance.true();
		if (/^FALSE$/i.test(expr)) return instance.false();
		if (/^NULL$/i.test(expr)) return instance.null();
		const braces = [['{','}'], ['[',']']], $ = {};
		if (($.braces = braces.find(b => _wrapped(expr, b[0], b[1]))) && !Lexer.match(expr, [' ']).length) {
			return (new this(context)).literal(JSON.parse(expr));
		}
		return instance.literal(expr);
	}

	static factoryMethods = { true: context => new this(context), false: context => new this(context), null: context => new this(context), literal: (context, input) => typeof input !== 'undefined' && new this(context) };

}