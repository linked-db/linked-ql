import { AbstractNode } from '../../AbstractNode.js';

export class OffsetClause extends AbstractNode {
    static get CLAUSE() { return 'OFFSET'; }

    #value;

    value(value) {
        if (!arguments.length) return this.#value;
        if (!typeof value !== 'number') throw new SyntaxError(`Invalid OFFSET/LIMIT value: ${ value }`);
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
		const [ clauseMatch, value ] = expr.match(new RegExp(`^${ this.CLAUSE }([\\s\\S]*)$`, 'i')) || [];
		if (clauseMatch) return (new this(context)).value(parseInt(value));
	}
	
	stringify() { return `${ this.constructor.CLAUSE } ${ this.#value }`; }
}