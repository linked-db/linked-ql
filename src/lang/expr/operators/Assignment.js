import { Lexer } from '../../Lexer.js';
import { AbstractOperator2Expr } from '../abstracts/AbstractOperator2Expr.js';
import { ColumnsSpec } from '../../dml/clauses/ColumnsSpec.js';
import { RowSpec } from '../../dml/clauses/RowSpec.js';
import { PathRight } from '../path/PathRight.js';
import { ColumnRef } from '../refs/ColumnRef.js';
import { Exprs } from '../grammar.js';

export class Assignment extends AbstractOperator2Expr {
    static get OPERATORS() { return ['=']; }
    static get LHS_TYPES() { return [ColumnsSpec, PathRight, ColumnRef]; }
    static get RHS_TYPES() { return [RowSpec, ...Exprs]; }
	
	static parse(context, expr, parseCallback) {
		const [lhs, rhs] = Lexer.split(expr, this.OPERATORS);
        if (!rhs) return;
		const instance = (new this(context)).operator('=');
		instance.lhs(parseCallback(instance, lhs.trim(), this.LHS_TYPES));
		instance.rhs(parseCallback(instance, rhs.trim(),  this.RHS_TYPES));
		return instance;
	}
}