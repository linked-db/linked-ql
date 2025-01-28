import { AbstractNode } from '../../AbstractNode.js';
import { Exprs } from '../../expr/grammar.js';

export class LimitClause extends AbstractNode {
    static get CLAUSE() { return 'LIMIT'; }

    #expr;

    expr(expr) {
        if (!arguments.length) return this.#expr;
        this.#expr = this.$castInputs([expr], Exprs, this.#expr, 'limit_expr');
        return this;
    }

	static fromJSON(context, json, callback = null) {
		if (Object.keys(json || {}).filter((k) => !['nodeName', 'expr'].includes(k)).length) return;
		return super.fromJSON(context, json, (instance) => {
			if (json.expr) instance.expr(json.expr);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			expr: this.#expr?.jsonfy(options),
			...jsonIn
		});
	}

	static parse(context, expr, parseCallback) {
        const [ clauseMatch, $expr ] = expr.match(new RegExp(`^${ this.CLAUSE }([\\s\\S]*)$`, 'i')) || [];
		if (!clauseMatch) return;
		const instance = new this(context);
		instance.expr(parseCallback(instance, $expr.trim(), Exprs));
		return instance;
	}
	
	stringify() { return `${ this.constructor.CLAUSE } ${ this.#expr }`; }
}