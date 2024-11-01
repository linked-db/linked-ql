import { AbstractNode } from '../AbstractNode.js';

export class Identifier extends AbstractNode {
	
	#name;

	name(value) {
		if (!arguments.length) return this.#name;
		if (typeof value !== 'string') throw new TypeError(`Invalid argument as identifier name: ${ value }.`);
		return (this.#name = value, this);
	}

	identifiesAs(value) {
		if (typeof value === 'string') return this.$eq(this.#name, value, 'ci');
		return super.identifiesAs(value);
	}

	static fromJSON(context, json, callback = null) {
		if (typeof json === 'string') json = { name: json };
		else if (typeof json?.name !== 'string') return;
		return super.fromJSON(context, json, (instance) => {
			instance.name(json.name);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			name: this.#name,
			...jsonIn,
		});
	}
	
	static parse(context, expr) {
		if (/^(TRUE|FALSE|NULL)$/i.test(expr)) return;
		const [name] = this.parseIdent(context, expr).reverse();
		if (!name) return;
		return (new this(context)).name(name);
	}
	
	stringify() { return this.stringifyIdent(this.#name); }
}