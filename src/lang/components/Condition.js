
import Lexer from '../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import Assertion from './Assertion.js';
import Parens from './Parens.js';

export default class Condition extends AbstractNode {

	/**
	 * Instance properties
	 */
	LOGIC = '';
	ASSERTIONS = [];

	/**
	 * @constructor
	 */
	constructor(context, logic) {
		super(context);
		this.LOGIC = logic;
	}

	/**
	 * Establish an AND logic
	 * 
	 * @param  Array ...assertions 
	 * 
	 * @returns this
	 */
	and(...assertions) {
		if (this.LOGIC === 'OR') return (new this.constructor(this)).and(this, ...assertions);
		this.LOGIC = 'AND';
		return (this.build('ASSERTIONS', assertions, [Condition,Assertion,Parens]), this);
	}

	/**
	 * Establish an OR logic
	 * 
	 * @param  Array ...assertions 
	 * 
	 * @returns this
	 */
	or(...assertions) {
		if (this.LOGIC === 'AND') return (new this.constructor(this)).or(this, ...assertions);
		this.LOGIC = 'OR';
		return (this.build('ASSERTIONS', assertions, [Condition,Assertion,Parens]), this);
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			logic: this.LOGIC,
			assertions: this.ASSERTIONS.map(o => o.toJson()),
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.logic !== 'string' || !/AND|OR/i.test(json.logic) || !Array.isArray(json.assertions)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance[json.logic.toLowerCase()](...json.assertions);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return this.ASSERTIONS.map(expr => expr instanceof Condition ? `(${ expr.stringify() })` : expr.stringify()).join(' ' + this.LOGIC + ' '); }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		for (const logic of ['AND', 'OR']) {
			const tokens = Lexer.split(expr, [`\\s+${ logic }\\s+`], { useRegex: 'i' });
			if (tokens.length > 1) {
				const instance = new this(context, logic);
				for (const $expr of tokens) instance[logic.toLowerCase()](parseCallback(instance, $expr));
				return instance;
			}
		}
		
	}
}
