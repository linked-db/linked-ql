
/**
 * @imports
 */
import { _wrapped } from '@webqit/util/str/index.js';
import { _isObject } from '@webqit/util/js/index.js';
import Lexer from '../../Lexer.js';
import Str from '../str/Str.js';

export default class Json extends Str {

	/**
	 * Instance properties
	 */
	TYPE;

	/**
	 * @constructor
	 */
	constructor(context, value, type, quote) {
		super(context, value, quote);
		this.TYPE = type;
	}

	/**
	 * Sets the value to an array
	 * 
	 * @param Object value
	 */
	array(value) {
		this.VALUE = Array.isArray(value) ? JSON.stringify(value) : value;
		this.TYPE = 'ARRAY';
	}

	/**
	 * Sets the value to an object
	 * 
	 * @param Object value
	 */
	object(value) {
		this.VALUE = _isObject(value) ? JSON.stringify(value) : value;
		this.TYPE = 'OBJECT';
	}

	/**
	 * @inheritdoc
	 */
	toJSON() {
		return {
			type: this.TYPE,
			...super.toJSON(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if (typeof json?.type !== 'string' || !/OBJECT|ARRAY/i.test(json.type) || !json.value) return;
		const instance = new this(context);
		instance[json.type.toLowerCase()](json.value);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ super.stringify() }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const braces = [['{','}'], ['[',']']], $ = {};
		const [text, quote] = this.parseText(context, expr) || [];
		if (!quote) return;
		if (!($.braces = braces.find(b => _wrapped(expr, b[0], b[1]))) || Lexer.match(expr, [' ']).length) return;
		return new this(context, text, $.braces[0] === '{' ? 'OBJECT' : 'ARRAY', quote);
	}

	static factoryMethods = { array: (context, value) => Array.isArray(value) && new this(context), object: (context, value) => _isObject(value) && new this(context) };
}