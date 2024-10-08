import Lexer from '../../Lexer.js';
import AbstractNode from '../../AbstractNode.js';
import Expr from '../Expr.js';

export default class WhenClause extends AbstractNode {
	
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

	toJSON() {
		return {
			condition: this.CONDITION?.toJSON(),
			consequence: this.CONSEQUENCE?.toJSON(),
		};
	}

	static fromJSON(context, json) {
		// json could be undefined or null, or json.condition could be set but 9
		if (!(typeof json === 'object' && json && 'condition' in json)) return;
		const instance = new this(context);
		instance.condition(json.condition);
		instance.then_(json.consequence);
		return instance;
	}
	
	stringify() { return `${ this.CONDITION } THEN ${ this.CONSEQUENCE }`; }

	static parse(context, expr, parseCallback) {
		const tokens = Lexer.split(expr, [`\\s+THEN\\s+`], { useRegex: 'i' });
		if (tokens.length !== 2) return;
		const instance = new this(context);
		const [condition, consequence] = tokens.map($expr => parseCallback(instance, $expr.trim()));
		instance.condition(condition).then_(consequence);
		return instance;
	}
}