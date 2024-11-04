import { AbstractNode } from '../AbstractNode.js';

export class Literal extends AbstractNode {

	#value;
	
	value(value) {
		if (!arguments.length) return this.#value;
		return (this.#value = value, this);
	}

	identifiesAs(value) { return value === this.#value || super.identifiesAs(value); }

	static get expose() {
		return {
			null: context => this.fromJSON(context, { value: null }),
			literal: (context, value) => this.fromJSON(context, { value }),
		};
	}

	static fromJSON(context, json, callback = null) {
		if ((typeof json?.value !== 'string' && ![null].includes(json?.value))
		|| Object.keys(json).filter((k) => k !== 'nodeName').length > 1) return;
		return super.fromJSON(context, json, (instance) => {
			instance.value(json.value);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			value: this.#value,
			...jsonIn,
		});
	}
	
	static parse(context, expr) {
		const instance = new this(context);
		if (/^NULL$/i.test(expr)) return instance.value(null);
		return instance.value(expr);
	}

	stringify() { return `${ this.#value }`; }
}