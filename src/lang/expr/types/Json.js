import { _wrapped } from '@webqit/util/str/index.js';
import { _isObject } from '@webqit/util/js/index.js';
import { Lexer } from '../../Lexer.js';
import { Str } from './Str.js';

export class Json extends Str {

	static get expose() {
		return { json: (context, value) => this.fromJSON(context, { value: Array.isArray(value) || _isObject(value) ? JSON.stringify(value) : value }) };
	}

	static fromJSON(context, json, callback = null) {
		if (!_isObject(json) || Object.keys(json).filter((k) => !['nodeName', 'value'].includes(k)).length) return;
		try { typeof json?.value === 'string' && JSON.parse(json.value); } catch(e) { return; }
		return super.fromJSON(context, json, (instance) => {
			callback?.(instance);
		});
	}
	
	static parse(context, expr) {
		const braces = [['{','}'], ['[',']']], $ = {};
		const [text, quote] = this.parseString(context, expr, true) || [];
		if (!quote) return;
		if (!($.braces = braces.find(b => _wrapped(expr, b[0], b[1]))) || Lexer.match(expr, [' ']).length) return;
		try { JSON.parse(text); } catch(e) { return; }
		return (new this(context, quote)).value(text);
	}
}