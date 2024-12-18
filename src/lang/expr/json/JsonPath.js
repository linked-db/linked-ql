import { Lexer } from '../../Lexer.js';
import { AbstractOperator2Expr } from '../abstracts/AbstractOperator2Expr.js';
import { ColumnRef } from '../refs/ColumnRef.js';
import { TypeCast } from '../types/TypeCast.js';
import { Json } from '../types/Json.js';
import { Str } from '../types/Str.js';
import { Num } from '../types/Num.js';

export class JsonPath extends AbstractOperator2Expr {
	static get OPERATORS() { return ['->>', `->`, '#>>', '#>']; }
	static get LHS_TYPES() { return [Json,ColumnRef]; }
    static get RHS_TYPES() { return [TypeCast,Json,Num,Str]; }
	 
	static get expose() {
		return { path: (context, lhs, operator, rhs) => this.fromJSON(context, { lhs, operator, rhs }), };
	}
	
	static parse(context, expr, parseCallback) {
		if ((context?.params?.inputDialect || context?.params?.dialect) === 'mysql') return;
		const { tokens: [lhs, rhs], matches: [operator] } = Lexer.lex(expr, this.OPERATORS, { limit: 1 });
		if (!lhs || !operator || !rhs) return;
		const instance = (new this(context)).operator(operator);
		instance.lhs(parseCallback(instance, lhs.trim(), this.LHS_TYPES));
		instance.rhs(parseCallback(instance, rhs.trim(), this.RHS_TYPES));
		return instance;
	}
}
