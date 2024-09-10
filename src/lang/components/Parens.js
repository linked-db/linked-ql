
import Lexer from '../Lexer.js';
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import Select from '../dml/select/SelectStatement.js';
import AbstractNode from '../AbstractNode.js';
import Expr from './Expr.js';

export default class Parens extends AbstractNode {
	
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
	get PREFIX() { return this.$EXPR?.PREFIX; }

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
	toJSON() { return { expr: this.$EXPR?.toJSON(), flags: this.FLAGS, }; }

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
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