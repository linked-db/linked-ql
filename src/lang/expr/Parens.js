import { Lexer } from '../Lexer.js';
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import { AbstractNode } from '../AbstractNode.js';
import { Exprs } from './grammar.js';

export class Parens extends AbstractNode {
	static get EXPECTED_TYPES() { return Exprs; }
	
	#expr;

	expr(...args) {
		if (!arguments.length) return this.#expr;
		this.#expr = this.$castInputs(args, this.constructor.EXPECTED_TYPES, this.#expr, 'parens_expr');
		return this;
	}

	exprUnwrapped() { return this.#expr instanceof Parens ? this.#expr.exprUnwrapped() : this.#expr; }

	static get expose() {
		return { parens: (context, expr) => this.fromJSON(context, { expr: expr }), };
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.expr) return;
		return super.fromJSON(context, json, (instance) => {
			instance.expr(json.expr);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			expr: this.#expr?.jsonfy(options),
			...jsonIn,
		});
	}
	
	static parse(context, expr, parseCallback) {
		if (!_wrapped(expr, '(', ')') || Lexer.match(expr, [' ']).length && Lexer.split(expr, []).length === 2/* recognizing the first empty slot */) return;
		const instance = new this(context);
		const $expr = parseCallback(instance, _unwrap(expr, '(', ')'), this.constructor.EXPECTED_TYPES);
		return instance.expr($expr);
	}
	
	stringify() { return '(' + this.#expr.stringify() + ')'; }
}