import { AbstractOperator1Expr } from '../abstracts/AbstractOperator1Expr.js';

export class Math extends AbstractOperator1Expr {
    static get OPERATORS() { return ['+', '-', '*', '/']; }
	 
	static get expose() {
		return {
            sum: (context, ...entries) => entries.length > 1/*Particularly to disambiguate with aggr.sum()*/ && this.fromJSON(context, { operator: '+', entries }),
		    sub: (context, ...entries) => this.fromJSON(context, { operator: '-', entries }),
		    'times|tms': (context, ...entries) => this.fromJSON(context, { operator: '*', entries }),
		    div: (context, ...entries) => this.fromJSON(context, { operator: '/', entries }),
        };
    }
}