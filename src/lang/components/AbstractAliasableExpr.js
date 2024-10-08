
import AbstractNode from '../AbstractNode.js';
import Expr from './Expr.js';
import Literal from './Literal.js';
import Identifier from './Identifier.js';
import Parens from './Parens.js';
import Path from './Path.js';

export default class AbstractAliasableExpr extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	EXPR;
	ALIAS;
	CLAUSED;

	/**
	 * Sets the expr
	 * 
	 * @param Any expr
	 * 
	 * @returns this
	 */
	expr(expr) {
		if (!arguments.length) return this.EXPR;
		return (this.build('EXPR', [expr], this.constructor.exprTypes), this);
	}

	/**
	 * Sets the expr
	 * 
	 * @param Array fns
	 * 
	 * @returns this
	 */
	query(...fns) {
		if (!arguments.length) return this.EXPR instanceof Parens ? this.EXPR : null;
		return (this.build('EXPR', fns, Parens, 'query'), this);
	}
	
	/**
	 * Sets the alias
	 * 
	 * @param String alias
	 * 
	 * @returns this
	 */
	as(alias, claused = true) {
		this.build('ALIAS', [alias], Identifier);
		this.CLAUSED = claused;
		return this;
	}

	toJSON() { return { expr: this.EXPR?.toJSON(), alias: this.ALIAS?.toJSON(), claused: this.CLAUSED, flags: this.FLAGS }; }

	static fromJSON(context, json) {
		const instance = (new this(context)).withFlag(...(json.flags || []));
		if (json?.expr) {
			instance.expr(json.expr);
			if (json.alias) instance.as(json.alias, json.claused);
		} else if (json) instance.expr(json);
		return instance;
	}
	
	stringify() {
		const alias = this.ALIAS || this.EXPR instanceof Path && this.EXPR.JOINT && this.autoEsc(this.EXPR.clone().stringify());
		return [this.EXPR, this.CLAUSED ? 'AS' : '', alias].filter(s => s).join(' ');
	}
	
	static parse(context, expr, parseCallback) {
		const instance = new this(context);
		const escChar = this.getEscChar(context, true);
		// With an "AS" clause, its easy to obtain the alias...
		// E.g: SELECT first_name AS fname, 4 + 5 AS result, 5 + 5
		// Without an "AS" clause, its hard to determine if an expression is actually aliased...
		// E.g: In the statement SELECT first_name fname, 4 + 5 result, 5 + 5, (SELECT ...) alias FROM ...,
		let [ , $expr, $separator, aliasUnescaped, /*esc*/, aliasEscaped ] = (new RegExp(`^([\\s\\S]+?)` + `(?:` + `(\\s+AS\\s+|(?<!(?:~>|<~))\\s+)` + `(?:([\\w]+)|(${ escChar })((?:\\4\\4|[^\\4])+)\\4)` + `)?$`, 'i')).exec(expr.trim()) || [];
		let exprNode, $alias = aliasUnescaped || aliasEscaped;
		if ($alias && !$separator?.trim() && !$expr.trim().endsWith(')')) {
			try {
				exprNode = parseCallback(instance, $expr, this.exprTypes);
			} catch(e) {}
			if (!exprNode) {
				$alias = aliasUnescaped = aliasEscaped = null;
				$expr = expr; // IMPORTANT
			}
		}
		if (!exprNode) { exprNode = parseCallback(instance, $expr, this.exprTypes); }
		instance.expr(exprNode);
		if ($alias) {
			const alias = aliasUnescaped || this.autoUnesc(instance, aliasEscaped);
			const claused = !!$separator?.trim();
			instance.as(alias, claused);
		}
		return instance;
	}

	/**
	 * @property Array
	 */
	static get exprTypes() { return Expr.Types.filter(t => t !== Literal); }
}