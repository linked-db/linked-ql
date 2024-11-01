import { Lexer } from '../../Lexer.js';
import { AbstractNodeList } from './AbstractNodeList.js';
import { Exprs } from '../grammar.js';

export class AbstractOperator1Expr extends AbstractNodeList {
	static get EXPECTED_TYPES() { return Exprs; }
	static get OPERATORS() { return []; }

	#operator;

	operator(value) {
		if (!arguments.length) return this.#operator;
		if (!this.constructor.OPERATORS.includes(value)) throw new Error(`Unknown operator: ${ value }.`);
		return (this.#operator = value, this);
	}

	static fromJSON(context, json, callback = null) {
		if (!this.OPERATORS.includes(json?.operator)) return;
		return super.fromJSON(context, json, (instance) => {
			instance.operator(json.operator)
			callback?.(instance);
		});
	}

    jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			operator: this.#operator,
			...jsonIn,
		});
	}
	
	static parse(context, expr, parseCallback) {
		if (this.CLAUSE) {
            const [ clauseMatch, spec ] = expr.match(new RegExp(`^${ this.CLAUSE }([\\s\\S]*)$`, 'i')) || [];
            if (!clauseMatch) return;
            expr = spec;
        }
		for (const operator of this.OPERATORS) {
			const tokens = Lexer.split(expr, [ /^\w+$/.test(operator) ? `\\s+${ operator }\\s+` : operator.split('').map(_operator => `\\${ _operator }`).join('') ], { useRegex: 'i' });
			if (tokens.length < (this.minEntries || 2)) return;
			const instance = (new this(context)).operator(operator);
			return instance.add(...tokens.map(token => parseCallback(instance, token.trim())));
		}
	}

	stringify() {
		// operator is e.g.: AND|OR, +|-|ect
		let str = this.entries().join(` ${ this.#operator } `);
		if (this.constructor.CLAUSE) {
			// E.g. WHERE|ON|HAVING Clause
            if (!this.entries().length) return '';
            str = `${this.constructor.CLAUSE} ${str}`;
        } else if (this.contextNode instanceof this.constructor) {
			// e.g. Logical and Mathematical classes
			str = `(${ str })`;
		};
		return str;
	}
}
