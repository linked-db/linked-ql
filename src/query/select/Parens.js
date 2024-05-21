
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import Node from '../abstracts/Node.js';
import Expr from './abstracts/Expr.js';
import Select from './Select.js';
import Lexer from '../Lexer.js';

export default class Parens extends Node {
	
	/**
	 * Instance properties
	 */
	$EXPR;

	/**
	 * @constructor
	 */
	constructor(context, expr) {
		super(context);
		this.$EXPR = expr;
	}

	/**
	 * @property String
	 */
	get NAME() { return this.$EXPR?.NAME; }

	/**
	 * @property String
	 */
	get BASENAME() { return this.$EXPR?.BASENAME; }

	/**
	 * @property Node
	 */
	get EXPR() { return this.$EXPR?.EXPR || this.$EXPR; }

	/**
	 * Helper method to start a subquery.
	 * 
	 * @param  Array fns
	 * 
	 * @returns Void
	 */
	query(...fns) { return (this.build('$EXPR', fns, Select), this.$EXPR); }

	/**
	 * Sets the expr
	 * 
	 * @param Array fns
	 * 
	 * @returns this
	 */
	expr(...fns) { return (this.build('$EXPR', fns, [Select, ...Expr.Types]), this.$EXPR); }

	/**
	 * @inheritdoc
	 */
	toJson() { return { expr: this.$EXPR?.toJson(), flags: this.FLAGS, }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!json?.expr || Object.keys(json).length !== (json.flags ? 2 : 1)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.expr(json.expr);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return '(' + this.$EXPR.stringify() + ')'; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		if (!_wrapped(expr, '(', ')') || Lexer.match(expr, [' ']).length && Lexer.split(expr, []).length === 2/* recognizing the first empty slot */) return;
		return new this(context, parseCallback(context, _unwrap(expr, '(', ')'), [Select, ...Expr.Types]));
	}
}