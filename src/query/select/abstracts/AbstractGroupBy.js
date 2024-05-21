
import Lexer from '../../Lexer.js';
import Node from '../../abstracts/Node.js';
import Expr from './Expr.js';

export default class AbstractGroupBy extends Node {
	
	/**
	 * Instance properties
	 */
	CRITERIA = [];

	/**
	 * Adds a criterion.
	 * 
	 * @param Array ...args
	 * 
	 * @returns this
	 */
	criterion(...args) { return this.build('CRITERIA', args, Expr.Types); }

	/**
	 * @inheritdoc
	 */
	stringify() { return this.CRITERIA.map(criterion => criterion.stringify()).join(','); }

	/**
	 * @inheritdoc
	 */
	toJson() { return { criteria: this.CRITERIA.map(c => c.toJson()), flags: this.FLAGS }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.criteria)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.criterion(...json.criteria);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ groupByMatch, criteriaExpr ] = expr.match(new RegExp(`^${ this.regex }([\\s\\S]*)$`, 'i')) || [];
		if (!groupByMatch) return;
		const instance = new this(context);
		for (const criterionExpr of Lexer.split(criteriaExpr.trim(), [','])) {
			instance.criterion(parseCallback(instance, criterionExpr));
		}
		return instance;
	}

	/**
	 * @property String
	 */
	static regex = 'GROUP\\s+BY';
}