import { _isObject } from '@webqit/util/js/index.js';
import { AbstractNode } from '../../AbstractNode.js';

export class AbstractOperator2Expr extends AbstractNode {
    static get OPERATORS() { return []; }
    static get LHS_TYPES() { return []; }
    static get RHS_TYPES() { return []; }

    #operator;
    #lhs;
    #rhs;

	operator(value) {
		if (!arguments.length) return this.#operator;
		if (!testOperator(this.constructor.OPERATORS, value)) throw new Error(`Invalid operator: ${ value }`);
		return (this.#operator = value, this);
	}

	operands(lhs, rhs) {
		if (!arguments.length) return [this.#lhs, this.#rhs];
		const operator = this.constructor.OPERATORS[0];
		return this.lhs(lhs).rhs(rhs).operator(_isObject(operator) ? operator.operator : operator);
	}

	lhs(value) {
		if (!arguments.length) return this.#lhs;
		this.#lhs = this.$castInputs([value], this.constructor.LHS_TYPES, this.#lhs, 'lhs_expr');
		return this;
	}

	rhs(value) {
		if (!arguments.length) return this.#rhs;
		this.#rhs = this.$castInputs([value], this.constructor.RHS_TYPES, this.#rhs, 'rhs_expr');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.operator || !testOperator(this.OPERATORS, json.operator) || !json.lhs || ('rhs' in json && !json.rhs)) return;
		return super.fromJSON(context, json, (instance) => {
			instance.operator(json.operator).lhs(json.lhs);
			if (json.rhs) instance.rhs(json.rhs);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			operator: this.#operator,
			lhs: this.#lhs?.jsonfy(options),
			...(this.#rhs ? { rhs: this.#rhs.jsonfy(options) } : {}),
			...jsonIn
		});
	}
	
	stringify() { return [this.#lhs, this.#operator].concat(this.#rhs || []).join(' '); }
}

const testOperator = (list, op) => list.some(re => !_isObject(re) ? op === re : (op === re.operator || (new RegExp(re.test)).test(` ${ op } `/*intentional space around*/)));
