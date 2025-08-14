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

	static morphsTo() { return [registry.LQDeepRef1, registry.LQDeepRef2, registry.LQDeepDeepRef1, registry.LQDeepDeepRef2]; }

	/* API */

	operand() { return this.left(); }

	endpoint() { return this.right() instanceof LQDeepDeepRef1 ? this.right().endpoint() : this.right(); }

	/* JSON API */

	jsonfy({ toDeepRef = false, toKind = 1, ...options } = {}, transformer = null, linkedDb = null) {
		if (toDeepRef || toKind === 1 || toKind === 2) {
			const altsMap = [
				registry.LQDeepRef1.NODE_NAME, registry.LQDeepRef2.NODE_NAME,
				registry.LQDeepDeepRef1.NODE_NAME, registry.LQDeepDeepRef2.NODE_NAME
			];

			let currentIndex = altsMap.indexOf(this.NODE_NAME);
			if (toDeepRef && currentIndex > 1) {
				currentIndex -= 2;
			}

			const NODE_NAME = altsMap[(currentIndex + 1) % 2 === toKind % 2
				? currentIndex
				: (toKind % 2 // its 1 or 3
					? currentIndex - 1
					: currentIndex + 1)];

			return {
				nodeName: NODE_NAME,
				left: this.left().jsonfy({ toKind: currentIndex > 1 ? 2 : 1 }), // Left is always ColumnRef1 for DeepRef, but ColumnRef2 for DeepDeepRef
				right: this.right().jsonfy({ toKind: this.right() instanceof LQDeepDeepRef1 ? toKind : undefined }),
			};
		}

		return super.jsonfy(options, transformer, linkedDb);
	}
}