import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { ErrorFKInvalid } from './abstracts/ErrorFKInvalid.js';

export class LQDeepDeepRef extends AbstractMagicRef {

	/* SYNTAX RULES */

	static get _rightType() { return ['LQDeepDeepRef', 'LQObjectLiteral', 'LQArrayLiteral', 'ColumnsConstructor', 'ColumnNameRef']; } // for inheritance

	static get syntaxRules() {
		return [
			{ type: 'ColumnNameRef', as: 'left', peek: [1, 'operator', '~>'] },
			{ type: 'operator', value: '~>' },
			{ type: this._rightType, as: 'right' },
		];
	}

	static get syntaxPriority() { return -1; }

	/* SCHEMA API */

	deriveSchema(linkedDb) {
		const fk = this.left().deriveSchema(linkedDb)/* ColumnSchema */.fkConstraint(true);
		if (!fk) throw new ErrorFKInvalid(`[${this.parentNode || this}] Column ${this.left()} is not a foreign key.`);
		return fk.targetTable()/*the table in there*/.deriveSchema(linkedDb)/* TableSchema */;
	}

	endpoint() { return this.right() instanceof LQDeepDeepRef ? this.right().endpoint() : this.right(); }
}