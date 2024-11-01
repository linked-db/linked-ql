import { AbstractOperator1Expr } from '../abstracts/AbstractOperator1Expr.js';

export class StrJoin extends AbstractOperator1Expr {
	static get OPERATORS() { return ['||']; }

	static get expose() {
		return { join: (context, ...entries) => this.fromJSON(context, { operator: '||', entries }), };
	}
}
