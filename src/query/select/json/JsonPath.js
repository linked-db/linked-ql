
import Node from '../../abstracts/Node.js';
import Lexer from '../../Lexer.js';
import Identifier from '../Identifier.js';
import Json from './Json.js';
import Num from '../Num.js';
import Str from '../str/Str.js';

export default class JsonPath extends Node {
	
	/**
	 * Static properties
	 */
	static OPERATORS = [`->`, '->>', '#>', '#>>'];

	/**
	 * Instance propeties
	 */
	OPERATOR = '';
	LHS = null;
	RHS = null;

	/**
	 * Builds the operands.
	 * 
	 * @param Identifier lhs 
	 * @param String operator
	 * @param Identifier,Path rhs 
	 * 
	 * @returns Void
	 */
	path(lhs, operator, rhs) {
		const $static = this.constructor;
		if (!$static.OPERATORS.includes(operator)) throw new Error(`Unknown operator: "${ operator }".`);
		this.build('LHS', [lhs], [Json,Identifier]);
		this.build('RHS', [rhs], [Json,Num,Str]);
		this.OPERATOR = operator;
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			lhs: this.LHS?.toJson(),
			rhs: this.RHS?.toJson(),
			operator: this.OPERATOR,
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!this.OPERATORS.includes(json?.operator)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.path(json.lhs, json.operator, json.rhs);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.LHS } ${ this.OPERATOR } ${ this.RHS }`; }
	 
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		if ((context?.params?.inputDialect || context?.params?.dialect) === 'mysql') return;
		let { tokens, matches } = Lexer.lex(expr, this.OPERATORS, { limit: 1 });
		if (!matches.length) return;
		const instance = new this(context);
		const lhs = parseCallback(instance, tokens[0], [Json,Identifier]);
		const rhs = parseCallback(instance, tokens[1].trim(), [Json,Num,Str]);
		instance.path(lhs, matches[0], rhs);
		return instance;
	}

	static factoryMethods = { path: (context, lhs, operator, rhs) => this.OPERATORS.includes(operator) && new this(context) };
}
