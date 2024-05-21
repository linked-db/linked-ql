
import { _unwrap } from '@webqit/util/str/index.js';
import Lexer from '../Lexer.js';
import Condition from './Condition.js';
import Expr from './abstracts/Expr.js';
import Node from '../abstracts/Node.js';

export default class Assertion extends Node {
	
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
	 * API for generic asserts
	 * 
	 * @param String operator 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	assert(operator, ...operands) {
		if (this.OPERATOR) this.OPERANDS.splice(0);
		this.OPERATOR = operator;
		return (this.build('OPERANDS', operands, Expr.Types), this);
	}

	/**
	 * API for "="
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	equals(...operands) { return this.assert('=', ...operands); }

	/**
	 * @alias equal
	 */
	eq(...operands) { return this.equal(...operands); }

	/**
	 * API for "="
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	notEqual(...operands) { return this.assert('<>', ...operands); }

	/**
	 * @alias notEqual
	 */
	notEq(...operands) { return this.notEqual(...operands); }

	/**
	 * API for "<"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	lesserThan(...operands) { return this.assert('<', ...operands); }

	/**
	 * @alias lesserThan
	 */
	lt(...operands) { return this.lesserThan(...operands); }

	/**
	 * API for "<="
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	lessThanOrEqual(...operands) { return this.assert('<=', ...operands); }

	/**
	 * @alias lessThanOrEqual
	 */
	ltOrEq(...operands) { return this.lessThanOrEqual(...operands); }

	/**
	 * API for ">"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	greaterThan(...operands) { return this.assert('>', ...operands); }
	
	/**
	 * @alias greaterThan
	 */
	gt(...operands) { return this.greaterThan(...operands); }

	/**
	 * API for ">="
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	greaterThanOrEqual(...operands) { return this.assert('>=', ...operands); }
	
	/**
	 * @alias greaterThanOrEqual
	 */
	gtOrEq(...operands) { return this.greaterThanOrEqual(...operands); }

	/**
	 * API for "IN"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	in(...operands) { return this.assert('IN', ...operands); }

	/**
	 * API for "ANY"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	any(...operands) { return this.assert('ANY', ...operands); }

	/**
	 * API for "LIKE"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	like(...operands) { return this.assert('LIKE', ...operands); }

	/**
	 * API for "IS NULL"
	 * 
	 * @param Any operand 
	 * 
	 * @returns this
	 */
	isNull(...operands) { return this.assert('IS NULL', ...operands); }

	/**
	 * API for "IS NOT NULL"
	 * 
	 * @param Any operand 
	 * 
	 * @returns this
	 */
	isNotNull(...operands) { return this.assert('IS NOT NULL', ...operands); }

	/**
	 * API for "IS TRUE"
	 * 
	 * @param Any operand 
	 * 
	 * @returns this
	 */
	isTrue(...operands) { return this.assert('IS TRUE', ...operands); }

	/**
	 * API for "IS NOT TRUE"
	 * 
	 * @param Any operand 
	 * 
	 * @returns this
	 */
	isNotTrue(...operands) { return this.assert('IS NOT TRUE', ...operands); }

	/**
	 * API for "IS FALSE"
	 * 
	 * @param Any operand 
	 * 
	 * @returns this
	 */
	isFalse(...operands) { return this.assert('IS FALSE', ...operands); }

	/**
	 * API for "IS NOT FALSE"
	 * 
	 * @param Any operands 
	 * 
	 * @returns this
	 */
	isNotFalse(...operands) { return this.assert('IS NOT FALSE', ...operands); }

	/**
	 * API for "IS UNKNOWN"
	 * 
	 * @param Any operand 
	 * 
	 * @returns this
	 */
	isUnknow(...operands) { return this.assert('IS UNKNOWN', ...operands); }

	/**
	 * API for "IS NOT UNKNOWN"
	 * 
	 * @param Any operand 
	 * 
	 * @returns this
	 */
	isNotUnknow(...operands) { return this.assert('IS NOT UNKNOWN', ...operands); }

	/**
	 * API for "IS DISTINCT FROM"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	isDistinctFrom(...operands) { return this.assert('IS DISTINCT FROM', ...operands); }

	/**
	 * API for "IS NOT DISTINCT FROM"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	isNotDistinctFrom(...operands) { return this.assert('IS NOT DISTINCT FROM', ...operands); }

	/**
	 * API for "IS BETWEEN"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	isBetween(...operands) { return this.assert('IS BETWEEN', ...operands); }

	/**
	 * API for "IS NOT BETWEEN"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	isNotBetween(...operands) { return this.assert('IS NOT BETWEEN', ...operands); }

	/**
	 * API for "IS BETWEEN SYMMETRIC"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	isBetweenSymmetric(...operands) { return this.assert('IS BETWEEN SYMMETRIC', ...operands); }

	/**
	 * API for "IS NOT BETWEEN SYMMETRIC"
	 * 
	 * @param Array operands 
	 * 
	 * @returns this
	 */
	isNotBetweenSymmetric(...operands) { return this.assert('IS NOT BETWEEN SYMMETRIC', ...operands); }

	/**
	 * A shortcut method to Condition.
	 * 
	 * @param Array args
	 * 
	 * @returns Assertion
	 */
	and(...args) { return (new Condition(this, 'AND')).and(this, ...args); }

	/**
	 * A shortcut method to Condition.
	 * 
	 * @param Array args
	 * 
	 * @returns Assertion
	 */
	or(...args) { return (new Condition(this, 'OR')).or(this, ...args); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			operator: this.OPERATOR,
			operands: this.OPERANDS.map(o => o.toJson()),
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.operator !== 'string' || !(new RegExp(this.regex)).test(` ${ json.operator } `/*intentional space around*/) || !Array.isArray(json.operands)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.assert(json.operator, ...json.operands);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const operands = this.OPERANDS.slice(0);
		const sql = [
			operands.shift(), 
			this.OPERATOR.toUpperCase(),
		];
		const rightHandSide = operands;
		if (this.OPERATOR === 'IN') sql.push(`(${ rightHandSide.join(',') })`);
		else if (/BETWEEN/i.test(this.OPERATOR)) sql.push(`(${ rightHandSide.join(' AND ') })`);
		else sql.push(`${ rightHandSide.join(' ') }`);
		return sql.filter(s => s).join(' ');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const { tokens: [lhs, rhs = ''], matches: [operator] } = Lexer.lex(expr, [this.regex], { useRegex: 'i' });
		if (!operator) return;
		const $operator = operator.trim().toUpperCase();
		const $operands = [lhs];
		if ($operator === 'IN') {
			$operands.push(...Lexer.split(_unwrap(rhs.trim(), '(', ')'), [',']));
		} else if (/BETWEEN/.test($operator)) {
			$operands.push(...Lexer.split(rhs, [' AND ']));
		} else if (rhs) {
			$operands.push(rhs);
		}
		return new this(context, $operator, ...$operands.map(opr => parseCallback(context, opr.trim())));
	}

	/**
	 * @property String
	 */
	static regex = '((\\s+(?:NOT\\s+)?IS\\s+(?:NOT\\s+)?(TRUE|FALSE|NULL|UNKNOWN|DISTINCT\\s+FROM)\\s+)|\\s+(ISNULL|NOTNULL|IN|ANY|LIKE|(?:NOT\\s+)?BETWEEN(?:\\s+SYMMETRIC)?)\\s+|(?:\\s+)?(=|<|<=|>=|>|!=|<>)(?:\\s+)?)';
}