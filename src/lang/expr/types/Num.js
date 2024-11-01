import { AbstractNode } from "../../AbstractNode.js";

export class Num extends AbstractNode {
	
	#value;

	value(value) {
		if (!arguments.length) return this.#value;
		if (typeof value !== 'number') throw new Error(`Cannot use ${ typeof value } as number.`);
		return (this.#value = value, this);
	}

	identifiesAs(value) { return value === this.#value || super.identifiesAs(value); }

	static get expose() {
		return {
			'num|int|float': (context, value) => this.fromJSON(context, { value: parseFloat(value) }),
			value: (context, value) => /^\d+$/.test(value) && this.fromJSON(context, { value: parseFloat(value) })
		};
	}

	static fromJSON(context, json, callback = null) {
		if (typeof json === 'number') {
			json = { value: json };
		} else if (typeof json?.value !== 'number') return;
		return super.fromJSON(context, json, (instance) => {
			instance.value(json.value);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			value: this.#value,
			...jsonIn
		});
    }
	
	static parse(context, expr) {
		if (!/^\d+$/.test(expr)) return;
		return (new this(context)).value(parseFloat(expr));
	}
	
	stringify() { return `${ this.#value }`; }
}