import { AbstractNode } from '../AbstractNode.js';
		
export class Binding extends AbstractNode {

	#offset = 0;
	#value;

	offset(value) {
		if (!arguments.length) return this.#offset;
		if (typeof value !== 'number') throw new Error(`Offset must be a number`);
		return (this.#offset = value, this);
	}

	value(value) {
		if (!arguments.length) return this.#value;
		return (this.#value = value, this);
	}

	static get expose() {
		return { binding: (context, value) => (new this(context)).value(value), };
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.nodeName && typeof json?.offset !== 'number') return;
		return super.fromJSON(context, json, (instance) => {
			if (json.offset) instance.offset(json.offset);
			if (json.value !== undefined) instance.value(json.value);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			offset: this.#offset,
			...(this.#value !== undefined ? { value: this.#value } : {}),
			...jsonIn
		});
	}

	static parse(context, expr) {
		const notation = (context?.params?.inputDialect || context?.params?.dialect) === 'mysql' ? '?' : '$';
		const [ match, offset ] = (new RegExp(`^\\${ notation }(\\d)$`)).exec(expr) || [];
		if (!match) return;
		return (new this(context)).offset(parseInt(offset));
	}
	
	stringify() { return this.params.dialect === 'mysql' ? '?' : `$${ this.#offset }`; }
}
