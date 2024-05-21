
import Lexer from '../../Lexer.js';
import Node from '../../abstracts/Node.js';
import Expr from './Expr.js';

export default class AbstractOrderBy extends Node {
	
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
	stringify() { return this.CRITERIA.map(criterion => [criterion, ...criterion.FLAGS].join(' ')).join(','); }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ orderByMatch, criteriaExpr ] = expr.match(new RegExp(`^${ this.regex }([\\s\\S]*)$`, 'i')) || [];
		if (!orderByMatch) return;
		const instance = new this(context);
		for (const criterionExpr of Lexer.split(criteriaExpr.trim(), [','])) {
			const [ , expr, sort ] = /([\s\S]+)\s+(ASC|DESC)$/i.exec(criterionExpr) || [ , criterionExpr ];
			instance.criterion((parseCallback(instance, expr)).withFlag(sort));
		}
		return instance;
	}

	/**
	 * @property String
	 */
	static regex = 'ORDER\\s+BY';
}