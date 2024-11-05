import { AbstractAliasableExpr } from '../abstracts/AbstractAliasableExpr.js';
import { Exprs } from '../grammar.js';

export class Property extends AbstractAliasableExpr {
    static get EXPECTED_TYPES() { return Exprs; }
    static get requireAliasForNoneIdents() { return true; }

	static get expose() {
		return {
			prop: (context, expr, alias) => this.fromJSON(context, { expr, alias }),
		};
	}
}