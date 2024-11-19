import { AbstractRef } from './AbstractRef.js';
import { TableRef } from './TableRef.js';

export class ColumnRef extends AbstractRef {
	static get PREFIX_TYPE() { return TableRef; }
	static get KIND() { return 'COLUMN'; }

	#prettyName;

	prettyName(value) {
		if (!arguments.length) return this.#prettyName;
		if (typeof value !== 'string') throw new TypeError(`Invalid argument as prettyName: ${ value }.`);
		return (this.#prettyName = value, this);
	}

	identifiesAs(value) {
		return super.identifiesAs(value) || this.$eq(this.#prettyName, value, 'ci');
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (typeof json?.prettyName === 'string') instance.prettyName(json.prettyName);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			...( this.#prettyName ? { prettyName: this.#prettyName } : {}),
			...jsonIn
		});
	}
}