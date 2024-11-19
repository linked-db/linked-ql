import { Lexer } from '../../Lexer.js';
import { AbstractNode } from '../../AbstractNode.js';
import { Exprs } from '../grammar.js';

export class WhenClause extends AbstractNode {
	
	#when;
	#then;

	when(value) {
		if (!arguments.length) return this.#when;
		this.#when = this.$castInputs([value], Exprs, this.#when, 'when_clause');
		return this;
	}

	then(value) {
		if (!arguments.length) return this.#then;
		this.#then = this.$castInputs([value], Exprs, this.#then, 'then_clause');
		return this;
	}

	static get expose() {
		return {
			when: (context, when) => this.fromJSON(context, { when }),
		};
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.when) return;
		return super.fromJSON(context, json, (instance) => {
			instance.when(json.when).then(json.then);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			when: this.#when?.jsonfy(options),
			then: this.#then?.jsonfy(options),
			...jsonIn,
		});
	}

	static parse(context, expr, parseCallback) {
		const [ clauseMatch, $expr ] = expr.match(new RegExp(`^WHEN([\\s\\S]*)$`, 'i')) || [];
		if (!clauseMatch) return;
		const tokens = Lexer.split($expr, [`\\s+THEN\\s+`], { useRegex: 'i' });
		if (tokens.length !== 2) return;
		const instance = new this(context);
		const [when, then] = tokens.map($expr => parseCallback(instance, $expr.trim()));
		return instance.when(when).then(then);
	}
	
	stringify() { return `WHEN ${ this.#when } THEN ${ this.#then }`; }
}