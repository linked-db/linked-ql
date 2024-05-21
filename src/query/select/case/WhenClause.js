
import Lexer from '../../Lexer.js';
import Node from '../../abstracts/Node.js';
import Expr from '../abstracts/Expr.js';

export default class WhenClause extends Node {
	
	/**
	 * Instance properties
	 */
	CONDITION = null;
	CONSEQUENCE = null;

	/**
	 * Sets the condition.
	 * 
	 * @param Any condition
	 * 
	 * @returns this
	 */
	condition(condition) { return (this.build('CONDITION', [condition], Expr.Types), this); }

	/**
	 * Sets the consequence.
	 * 
	 * @param Any consequence
	 * 
	 * @returns this
	 */
	then_(consequence) { return this.build('CONSEQUENCE', [consequence], Expr.Types); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			condition: this.CONDITION?.toJson(),
			consequence: this.CONSEQUENCE?.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		// json could be undefined or null, or json.condition could be set but 9
		if (!(typeof json === 'object' && json && 'condition' in json)) return;
		const instance = new this(context);
		instance.condition(json.condition);
		instance.then_(json.consequence);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.CONDITION } THEN ${ this.CONSEQUENCE }`; }

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const tokens = Lexer.split(expr, [`\\s+THEN\\s+`], { useRegex: 'i' });
		if (tokens.length !== 2) return;
		const instance = new this(context);
		const [condition, consequence] = tokens.map($expr => parseCallback(instance, $expr.trim()));
		instance.condition(condition).then_(consequence);
		return instance;
	}
}