import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';

export class LQDeepDeepRef1 extends AbstractMagicRef {

	/* SYNTAX RULES */

	static get _rightType() { return ['LQDeepDeepRef1', 'LQObjectLiteral', 'LQArrayLiteral', 'RowConstructor', 'ColumnRef2']; } // for inheritance

	static get syntaxRules() {
		return [
			{ type: ['ColumnRef2', 'LQBackRefAbstraction'], as: 'left', peek: [1, 'operator', '~>'] },
			{ type: 'operator', value: '~>' },
			{ type: this._rightType, as: 'right' },
		];
	}

	static get syntaxPriority() { return -1; }

	/* API */

	operand() { return this.left(); }

	endpoint() { return this.right() instanceof LQDeepDeepRef1 ? this.right().endpoint() : this.right(); }
}