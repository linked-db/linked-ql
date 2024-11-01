import { AbstractOperator1Expr } from '../abstracts/AbstractOperator1Expr.js';

export class Condition extends AbstractOperator1Expr {
    static get OPERATORS() { return ['AND', 'OR']; }
	static get CLAUSE() {}

    every(...args) { return this.operator('AND').add(...args); }

    some(...args) { return this.operator('OR').add(...args); }
	 
	static get expose() {
		return {
            every: (context, ...entries) => entries.length > 1/*Specifically to disambiguate with aggr.every()*/ && this.fromJSON(context, { operator: 'AND', entries }),
		    some: (context, ...entries) => this.fromJSON(context, { operator: 'OR', entries }),
        };
    }

}
