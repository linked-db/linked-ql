import { AbstractNode } from '../../AbstractNode.js';
import { Exprs } from '../../expr/grammar.js';

export class OrderCriteria extends AbstractNode {

	#expr;
	#direction;

	expr(expr) {
		if (!arguments.length) return this.#expr;
		this.#expr = this.$castInputs([expr], Exprs, this.#expr, 'order_by_expr');
		return this;
	}

	direction(value) {
		if (!arguments.length) return this.#direction;
		if (!['ASC','DESC'].includes(value = value.toUpperCase())) throw new Error(`Invalid sort direction: ${ value }`);
		return (this.#direction = value, this);
	}

	desc() { return this.direction('DESC'); }

	asc() { return this.direction('ASC'); }

	identifiesAs(value) { return this.#expr?.identifiesAs(value) || super.identifiesAs(value); }

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json.expr) instance.expr(json.expr);
			if (json.direction) instance.direction(json.direction);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			expr: this.#expr?.jsonfy(options),
			...(this.#direction ? { direction: this.#direction } : {}),
			...jsonIn
		});
	}

	static parse(context, expr, parseCallback) {
		const [ , $expr, flag ] = expr.match(new RegExp(`^([\\s\\S]+?)(?:\\s+(ASC|DESC))?$`, 'i')) || [];
		const instance = new this(context);
		instance.expr(parseCallback(instance, $expr, Exprs));
		if (flag) instance.direction(flag.toUpperCase());
		return instance;
	}
	
	stringify() { return [this.#expr.stringify(), this.#direction].filter(s => s).join(' '); }

}