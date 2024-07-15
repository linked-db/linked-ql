
import Lexer from '../Lexer.js';
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import Identifier from '../select/Identifier.js';
import Node from '../abstracts/Node.js';

export default class ColumnsList extends Node {

    /**
	 * Instance properties
	 */
    LIST = [];

	/**
	 * Adds a criterion.
	 * 
	 * @param Array ...args
	 * 
	 * @returns this
	 */
	list(...args) { return this.build('LIST', args, Identifier); }

	/**
	 * @inheritdoc
	 */
	toJson() { return { list: this.LIST.slice(0) }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.list)) return;
		return (new this(context)).col(...json.list);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `(${ this.LIST.join(', ') })`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		if (!_wrapped(expr, '(', ')')) return;
		const instance = new this(context);
		instance.list(...Lexer.split(_unwrap(expr, '(', ')'), [',']).map(arg => parseCallback(instance, arg.trim(), [Identifier])));
		return instance;
	}
}