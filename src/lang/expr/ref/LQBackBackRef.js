import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { registry } from '../../registry.js';

export class LQBackBackRef extends AbstractMagicRef {

	/* SYNTAX RULES */

	static get _leftType() {
		return [
			'LQBackRefEndpoint'/* must come first to prevent left-recursion */,
			'LQBackBackRef'
		];
	} // for inheritance

	static get syntaxRules() {
		return [
			{ type: this._leftType, as: 'left', peek: [1, 'operator', '<~'] },
			{ type: 'operator', value: '<~' },
			{ type: 'ColumnRef2', as: 'right', peek: [1, 'operator', '<~'] },
		];
	}

	static get syntaxPriority() { return 1; }

	static morphsTo() { return [registry.LQDeepRef1, registry.LQDeepRef2, registry.LQDeepDeepRef1, registry.LQDeepDeepRef2]; }

	/* API */

	operand() { return this.right(); }

	endpoint() { return this.left() instanceof LQBackBackRef ? this.left().endpoint() : this.left(); }

	/* JSON API */

	jsonfy({ reverseRef = false, toKind = 1, ...options } = {}, transformer = null, dbContext = null) {
		if (reverseRef) {
			return {
				nodeName: toKind === 2 
					? (reverseRef === Infinity ? registry.LQDeepDeepRef2.NODE_NAME : registry.LQDeepRef2.NODE_NAME)
					: (reverseRef === Infinity ? registry.LQDeepDeepRef1.NODE_NAME : registry.LQDeepRef1.NODE_NAME),
				left: this.right().jsonfy({ toKind: reverseRef !== Infinity ? 1 : 2, ...options }),
				right: this.left() instanceof registry.LQBackRefEndpoint
					? { nodeName: registry.ColumnRef2.NODE_NAME, value: this.left().value(), delim: this.left()._get('delim') }
					: this.left().jsonfy({ reverseRef: Infinity, toKind, ...options }),
			};
		}
		return super.jsonfy(options, transformer, dbContext);
	}
}