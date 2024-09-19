import { _wrapped } from '@webqit/util/str/index.js';
import { _isObject } from '@webqit/util/js/index.js';
import Lexer from '../../Lexer.js';
import Str from '../str/Str.js';

export default class Json extends Str {

	json(value) {
		if (!Array.isArray(value) && !_isObject(value)) throw new Error(`An array or object expected.`);
		return (this.VALUE = value, this);
	}

	static fromJSON(context, json) {
		if (!Array.isArray(json?.value) && !_isObject(json?.value)) return;
		return (new this(context)).value(json.value);
	}
	
	stringify() { return this.stringifyText(JSON.stringify(this.VALUE)); }
	
	static parse(context, expr) {
		const braces = [['{','}'], ['[',']']], $ = {};
		const [text, quote] = this.parseText(context, expr) || [];
		if (!quote) return;
		if (!($.braces = braces.find(b => _wrapped(expr, b[0], b[1]))) || Lexer.match(expr, [' ']).length) return;
		return (new this(context, quote)).json(JSON.parse(text));
	}

	static factoryMethods = { json: (context, value) => (Array.isArray(value) || _isObject(value)) && new this(context) };
}