import { AbstractNode } from '../../AbstractNode.js';
import { AbstractRef } from '../refs/AbstractRef.js';

export class AbstractAliasableExpr extends AbstractNode {
	static get EXPECTED_TYPES() { return []; }
	
	#expr;
	#alias;
	#claused;

	expr(expr) {
		if (!arguments.length) return this.#expr;
		this.#expr = this.$castInputs([expr], this.constructor.EXPECTED_TYPES, this.#expr, 'expr');
		return this;
	}
	
	alias(value, claused = true) {
		if (!arguments.length || typeof value === 'boolean') {
			if (this.#alias || !value) return this.#alias;
			if (typeof this.#expr.prettyName === 'function' && this.#expr.prettyName()) return this.#expr.prettyName();
			if (typeof this.#expr.name === 'function' && this.#expr.name() !== '*') return this.#expr.name();
			return;
		}
		this.#claused = claused;
		return (this.#alias = value, this);
	}
	
	as(...args) { return this.alias(...args); }

	identifiesAs(value) { return this.#expr?.identifiesAs(value); }

	schema() {
		const schema = this.expr()?.schema?.()/*ColumnSchema|TableSchema*/?.clone({ fullyQualified: true });
		return schema && this.#alias ? schema.name(this.#alias) : schema;
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json?.expr) {
				instance.expr(json.expr);
				if (json.alias || json.as) instance.as(json.alias || json.as, json.claused);
			} else if (json) instance.expr(json);
			if (![AbstractRef].some(c => instance.expr() instanceof c) && !instance.expr().isPath && !instance.alias() && this.requireAliasForNoneIdents) {
				throw new Error(`[${ this }]: An alias is required for a non-path properties.`);
			}
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		const alias = this.#alias || (options.deSugar && this.#expr.prettyName?.());
		return super.jsonfy(options, {
			expr: this.#expr?.jsonfy(options),
			...(alias ? { alias: alias, claused: this.#claused } : {}),
			...jsonIn,
		});
	}
	
	static parse(context, expr, parseCallback) {
		const instance = new this(context);
		const escChar = this.getEscChar(context, true);
		// With an "AS" clause, its easy to obtain the alias...
		// E.g: SELECT first_name AS fname, 4 + 5 AS result, 5 + 5
		// Without an "AS" clause, its hard to determine if an expression is actually aliased...
		// E.g: In the statement SELECT first_name fname, 4 + 5 result, 5 + 5, (SELECT ...) alias FROM ...,
		let [ , $expr, $separator, aliasUnescaped, /*esc*/, aliasEscaped ] = (new RegExp(`^([\\s\\S]+?)` + `(?:` + `(\\s+AS\\s+|(?<!(?:~>|<~|\\:))\\s+)` + `(?:([\\w]+)|(${ escChar })((?:\\4\\4|[^\\4])+)\\4)` + `)?$`, 'i')).exec(expr.trim()) || [];
		let exprNode, $alias = aliasUnescaped || aliasEscaped;
		if ($alias && !$separator?.trim() && ![']','}',')'].includes($expr.trim().slice(-1))) {
			try {
				exprNode = parseCallback(instance, $expr, this.EXPECTED_TYPES);
			} catch(e) {}
			if (!exprNode) {
				$alias = aliasUnescaped = aliasEscaped = null;
				$expr = expr; // IMPORTANT
			}
		}
		if (!exprNode) { exprNode = parseCallback(instance, $expr, this.EXPECTED_TYPES); }
		if (!$alias && ![AbstractRef].some(c => exprNode instanceof c) && !exprNode.isPath && this.requireAliasForNoneIdents) {
			throw new Error(`[${ this }]: An alias is required for a non-path properties.`);
		}
		instance.expr(exprNode);
		if ($alias) {
			const alias = aliasUnescaped || this.unesc(escChar, aliasEscaped);
			const claused = !!$separator?.trim();
			instance.as(alias, claused);
		}
		return instance;
	}
	
	stringify() { return [this.#expr, this.#claused ? 'AS' : '', this.#alias ? this.stringifyIdent(this.#alias) : null].filter(s => s).join(' '); }
}