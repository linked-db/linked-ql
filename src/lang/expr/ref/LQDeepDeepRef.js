import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { ErrorFKInvalid } from './abstracts/ErrorFKInvalid.js';

export class LQDeepDeepRef extends AbstractMagicRef {

	/* SYNTAX RULES */

	static get _rightType() { return ['LQDeepDeepRef', 'LQObjectLiteral', 'LQArrayLiteral', 'ColumnsConstructor', 'ClassicColumnRef']; } // for inheritance

	static get syntaxRules() {
		return [
			{ type: 'ClassicColumnRef', as: 'left', peek: [1, 'operator', '~>'] },
			{ type: 'operator', value: '~>' },
			{ type: this._rightType, as: 'right' },
		];
	}

	static get syntaxPriority() { return -1; }

	/* SYSTEM HOOKS */

	_capture(requestName, requestSource) {
		if (requestName === 'CONTEXT.TABLE_SCHEMA' && requestSource === this.right()) {
			return this.tableSchema();
		}
		return super._capture(requestName, requestSource);
	}

	/* API */

	tableSchema() {
		const fk = this.left().columnSchema().foreignKey();
		if (!fk) throw new ErrorFKInvalid(`[${this}]: Column ${this.left().clone({ fullyQualified: true })} is not a foreign key.`);
		return fk.targetTable()/*the table in there*/.tableSchema();
	}

	endpoint() { return this.right() instanceof LQDeepDeepRef ? this.right().endpoint() : this.right(); }
}