import { ParenShape } from '../../expr/shape/ParenShape.js';
import { registry } from '../../registry.js';

const {
	LQBackRef,
} = registry;

export class LQBackRefConstructor extends ParenShape {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return { type: 'paren_block', syntax: { type: 'Expr', as: 'expr', peek: [1, 'operator', '<~'] } };
	}

	static get syntaxPriority() { return 51; } // Above SetConstructor

	static morphsTo() { return this.expr()?.constructor().morphsTo(); }

	/* SYSTEM HOOKS */

	_capture(requestName, requestSource) {
		if (requestName === 'CONTEXT.TABLE_SCHEMA') {
			return this.tableSchema();
		}
		return super._capture(requestName, requestSource);
	}

	/* API */

	expr() { return this._get('expr'); }

	tableSchema() {
		const expr = this.expr();
		if (!(expr instanceof LQBackRef)) {
			throw new Error(`[${this.constructor.name}.<expr>] Expects an instance of LQBackRef but got ${expr?.constructor.name}`);
		}
		return expr.tableSchema();
	}

	jsonfy(options = {}, transformCallback = null) {
		if (options.deSugar) {
			const expr = this.expr();
			if (!(expr instanceof LQBackRef)) {
				throw new Error(`[${this.constructor.name}.<expr>] Expects an instance of LQBackRef but got ${expr?.constructor.name}`);
			}
			return expr.jsonfy(options, transformCallback);
		}
		return super.jsonfy(options, transformCallback);
	}
}