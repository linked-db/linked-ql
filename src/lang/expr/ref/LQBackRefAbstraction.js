import { ParenExpr } from '../abstraction/ParenExpr.js';

export class LQBackRefAbstraction extends ParenExpr {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return {
			type: 'paren_block',
			syntaxes: [
				{ type: 'Expr', as: 'expr', peek: [1, 'operator', '<~'] }, // (fk <~ fk2 <~ tbl)
				{ type: 'Expr', as: 'expr', peek: [2, 'operator', '<~'] }, // ((alias) fk <~ fk2 <~ tbl)
			],
		};
	}

	static get syntaxPriority() { return 51; } // Above RowConstructor

	/* AST API */

	expr() { return this._get('expr'); }
}