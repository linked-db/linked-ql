import { AbstractNode } from '../../AbstractNode.js';

export class Bool extends AbstractNode {

	#value;
	
	value(value) {
		if (!arguments.length) return this.#value;
		return (this.#value = value, this);
	}

	identifiesAs(value) { return value === this.#value || super.identifiesAs(value); }

	static get expose() {
		return {
			true: context => this.fromJSON(context, { value: true }),
			false: context => this.fromJSON(context, { value: false }),
			value: (context, value) => /^(TRUE|FALSE)$/i.test(value) && this.fromJSON(context, { value: /^TRUE$/i.test(value) })
		};
	}

	static fromJSON(context, json, callback = null) {
		if (![true,false].includes(json?.value) || Object.keys(json).filter((k) => !['nodeName', 'value'].includes(k)).length) return;
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
		if (/^TRUE$/i.test(expr)) return (new this(context)).value(true);
		if (/^FALSE$/i.test(expr)) return (new this(context)).value(false);
	}

	stringify() { return `${ this.#value }`; }
}