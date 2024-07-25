
import Lexer from '../../Lexer.js';
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import AbstractNode from '../../AbstractNode.js';
import Expr from '../../componets/Expr.js';

export default class ValuesList extends AbstractNode {

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
	list(...args) { return this.build('LIST', args, Expr.Types); }

	/**
	 * @inheritdoc
	 */
	toJson() { return { list: this.LIST.slice(0) }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.list)) return;
		return (new this(context)).list(...json.list);
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
		instance.list(...Lexer.split(_unwrap(expr, '(', ')'), [',']).map(arg => parseCallback(instance, arg.trim(), Expr.Types)));
		return instance;
	}
}