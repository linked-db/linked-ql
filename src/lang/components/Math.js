import Lexer from '../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import Expr from './Expr.js';

export default class Math extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	OPERATOR = '';
	OPERANDS = [];

	/**
	 * @constructor
	 */
	constructor(context, operator, ...operands) {
		super(context);
		this.OPERATOR = operator;
		this.OPERANDS = operands;
	}

	/**
	 * API for generic operations
	 * 
	 * @param String operator 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	calc(operator, ...operands) {
		if (this.OPERATOR && this.OPERATOR !== operator) {
			return (new this.constructor(this)).calc(operator, this, ...operands);
		}
		this.OPERATOR = operator;
		return (this.build('OPERANDS', operands, Expr.Types), this);
	}

	/**
	 * API for "+"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	sum(...operands) { return this.calc('+', ...operands); }

	/**
	 * API for "-"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	sub(...operands) { return this.calc('-', ...operands); }

	/**
	 * API for "/"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	div(...operands) { return this.calc('/', ...operands); }

	/**
	 * API for "*"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	times(...operands) { return this.calc('*', ...operands); }

	toJSON() {
		return {
			operator: this.OPERATOR,
			operands: this.OPERANDS.map(o => o.toJSON()),
			flags: this.FLAGS,
		};
	}

	static fromJSON(context, json) {
		if (typeof json?.operator !== 'string' || !/\+|\-|\*|\//.test(json.operator) || !Array.isArray(json.operands)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.calc(json.operator, ...json.operands);
		return instance;
	}

	stringify() { return this.OPERANDS.join(` ${ this.OPERATOR } `); }
	
	static parse(context, expr, parseCallback) {
		for (const operator of ['\\*', '\\/','\\+', '\\-']) {
			let { tokens, matches } = Lexer.lex(expr, [`(\\s+)?${ operator }(\\s+)?`], { useRegex: 'i' });
			if (tokens.filter(s => s.trim()).length < 2) continue; // Note that we're not simply asking matches.length; think SELECT * FROM
			return new this(context, matches.pop().trim(), ...tokens.map(expr => parseCallback(context, expr.trim())));
		}
	}
}