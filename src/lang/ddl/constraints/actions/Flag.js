import { AbstractAction } from '../../abstracts/AbstractAction.js';

export class Flag extends AbstractAction {

    #value;

    value(value) {
        if (!arguments.length) return this.#value;
        return (this.#value = value, this);
    }

    static fromJSON(context, json, callback = null) {
		if (!json?.value) return;
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
        const [value] = expr.match(/DEFERRABLE|NOT\s+DEFERRABLE|INITIALLY\s+DEFERRED|INITIALLY\s+IMMEDIATE|VISIBLE|INVISIBLE/i) || [];
        if (value) return (new this(context)).value(value.replace(/\s+/, '_').toUpperCase());
    }

    stringify() { return this.#value?.replace(/_/, ' ') || ''; }
}