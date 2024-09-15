
import Lexer from '../../../Lexer.js';
import AbstractNode from '../../../AbstractNode.js';
import Expr from '../../../components/Expr.js';

export default class AbstractOrderBy extends AbstractNode {
	
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

	toJSON() { return { criteria: this.CRITERIA.map(c => c.toJSON()), flags: this.FLAGS }; }

	static fromJSON(context, json) {
		if (!Array.isArray(json?.criteria)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.criterion(...json.criteria);
		return instance;
	}
	
	stringify() { return this.CRITERIA.map(criterion => [criterion, ...criterion.FLAGS].join(' ')).join(', '); }
	
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