import { Lexer } from '../../Lexer.js';
import { AbstractOperator2Expr } from '../abstracts/AbstractOperator2Expr.js';
import { Exprs } from '../grammar.js';

export class Assertion extends AbstractOperator2Expr {

	static get LHS_TYPES() { return Exprs; }
	static get RHS_TYPES() { return Exprs; }
	static get OPERATORS() {
		return [
			{ test: '<(?!~)' },
			{ test: '(?<!~)>', backtest: '^(?!.*~$)'/*For Lexer*/ },
			{ test: '((\\s+(?:NOT\\s+)?IS\\s+(?:NOT\\s+)?(TRUE|FALSE|NULL|UNKNOWN|DISTINCT\\s+FROM\\s+))|\\s+(ISNULL|NOTNULL|IN|ANY|LIKE|(?:NOT\\s+)?BETWEEN(?:\\s+SYMMETRIC)?)\\s+|(?:\\s+)?(=|<=|>=|!=|<>)(?:\\s+)?)' },
		];
	}

	static get expose() {
		return {
			'equals|eq': (context, lhs, rhs) => this.fromJSON(context, { operator: '=', lhs, rhs }),
			'notEqual|notEq': (context, lhs, rhs) => this.fromJSON(context, { operator: '<>', lhs, rhs }),
			'lesserThan|lt': (context, lhs, rhs) => this.fromJSON(context, { operator: '<', lhs, rhs }),
			'lessThanOrEqual|ltOrEq': (context, lhs, rhs) => this.fromJSON(context, { operator: '<=', lhs, rhs }),
			'greaterThan|gt': (context, lhs, rhs) => this.fromJSON(context, { operator: '>', lhs, rhs }),
			'greaterThanOrEqual|gtOrEq': (context, lhs, rhs) => this.fromJSON(context, { operator: '>=', lhs, rhs }),
			in: (context, lhs, rhs) => this.fromJSON(context, { operator: 'IN', lhs, rhs }),
			any: (context, lhs, rhs) => this.fromJSON(context, { operator: 'ANY', lhs, rhs }),
			like: (context, lhs, rhs) => this.fromJSON(context, { operator: 'LIKE', lhs, rhs }),
			notLike: (context, lhs, rhs) => this.fromJSON(context, { operator: 'NOT LIKE', lhs, rhs }),
			isNull: (context, lhs) => this.fromJSON(context, { operator: 'IS NULL', lhs }),
			isNotNull: (context, lhs) => this.fromJSON(context, { operator: 'IS NOT NULL', lhs }),
			isTrue: (context, lhs) => this.fromJSON(context, { operator: 'IS TRUE', lhs }),
			isNotTrue: (context, lhs) => this.fromJSON(context, { operator: 'IS NOT TRUE', lhs }),
			isFalse: (context, lhs) => this.fromJSON(context, { operator: 'IS FALSE', lhs }),
			isNotFalse: (context, lhs) => this.fromJSON(context, { operator: 'IS NOT FALSE', lhs }),
			isUnknow: (context, lhs) => this.fromJSON(context, { operator: 'IS UNKNOWN', lhs }),
			isNotUnknow: (context, lhs) => this.fromJSON(context, { operator: 'IS NOT UNKNOWN', lhs }),
			isDistinctFrom: (context, lhs, rhs) => this.fromJSON(context, { operator: 'IS DISTINCT FROM', lhs, rhs }),
			isNotDistinctFrom: (context, lhs, rhs) => this.fromJSON(context, { operator: 'IS NOT DISTINCT FROM', lhs, rhs }),
			isBetween: (context, lhs, rhs) => this.fromJSON(context, { operator: 'IS BETWEEN', lhs, rhs }),
			isNotBetween: (context, lhs, rhs) => this.fromJSON(context, { operator: 'IS NOT BETWEEN', lhs, rhs }),
			isBetweenSymmetric: (context, lhs, rhs) => this.fromJSON(context, { operator: 'IS BETWEEN SYMMETRIC', lhs, rhs }),
			isNotBetweenSymmetric: (context, lhs, rhs) => this.fromJSON(context, { operator: 'IS NOT BETWEEN SYMMETRIC', lhs, rhs }),
		};
	}
	
	static parse(context, expr, parseCallback) {
		const { tokens: [lhs, rhs = ''], matches: [operator] } = Lexer.lex(expr, this.OPERATORS, { useRegex: 'i' });
		if (!operator) return;
		const instance = (new this(context)).operator(operator.trim().replace(/\s+/, ' ').toUpperCase());
		instance.lhs(parseCallback(instance, lhs));
		if (rhs) instance.rhs(parseCallback(instance, rhs));
		return instance;
	}
}