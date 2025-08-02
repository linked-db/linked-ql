import { ParenShape } from '../../expr/shape/ParenShape.js';
import { registry } from '../../registry.js';

export class LQBackRefConstructor extends ParenShape {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return { type: 'paren_block', syntax: { type: 'Expr', as: 'expr', peek: [1, 'operator', '<~'] } };
	}

	static get syntaxPriority() { return 51; } // Above SetConstructor

	/* AST API */

	expr() { return this._get('expr'); }

	/* SCHEMA API */

	deriveSchema(linkedDb) {
		const expr = this.expr();
		if (!(expr instanceof registry.LQBackRef)) {
			throw new Error(`[${this.constructor.name}.<expr>] Expects an instance of LQBackRef but got ${expr?.constructor.name}`);
		}
		return expr.deriveSchema(linkedDb)/* TableSchema */;
	}
}