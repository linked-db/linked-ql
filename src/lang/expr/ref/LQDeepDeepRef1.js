import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { registry } from '../../registry.js';

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

	static morphsTo() { return registry.LQDeepRef1; }

	/* API */

	operand() { return this.left(); }

	endpoint() { return this.right() instanceof LQDeepDeepRef1 ? this.right().endpoint() : this.right(); }

	/* JSON API */

	jsonfy({ toDeepRef = false, ...options } = {}, transformer = null, linkedDb = null) {
		if (toDeepRef) {
			return {
				nodeName: registry.LQDeepRef1.NODE_NAME,
				left: this.left().jsonfy({ nodeNames: this.left() instanceof registry.ColumnRef2 ? false : true }),
				right: this.right().jsonfy()
			};
		}
		return super.jsonfy(options, transformer, linkedDb);
	}
}