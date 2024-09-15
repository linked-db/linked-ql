import Lexer from '../Lexer.js';
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import Select from '../dml/select/SelectStatement.js';
import AbstractNode from '../AbstractNode.js';
import Expr from './Expr.js';

export default class Parens extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	EXPR;

	/**
	 * Sets the expr
	 * 
	 * @param Array fns
	 * 
	 * @returns this
	 */
	expr(...fns) {
		if (!arguments.length) return this.EXPR;
		return (this.build('EXPR', fns, [Select, ...Expr.Types]), this);
	}

	/**
	 * Helper method to start a subquery.
	 * 
	 * @param  Array fns
	 * 
	 * @returns Void
	 */
	query(...fns) {
		if (!arguments.length) return this.EXPR instanceof Select ? this.EXPR : null;
		return (this.build('EXPR', fns, Select), this);
	}

	toJSON() { return { expr: this.EXPR?.toJSON(), flags: this.FLAGS.slice(), }; }

	static fromJSON(context, json) {
		if (!json?.expr || Object.keys(json).length !== (json.flags ? 2 : 1)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.expr(json.expr);
		return instance;
	}
	
	stringify() { return '(' + this.EXPR.stringify() + ')'; }
	
	static parse(context, expr, parseCallback) {
		if (!_wrapped(expr, '(', ')') || Lexer.match(expr, [' ']).length && Lexer.split(expr, []).length === 2/* recognizing the first empty slot */) return;
		return (new this(context)).expr(parseCallback(context, _unwrap(expr, '(', ')'), [Select, ...Expr.Types]));
	}
}