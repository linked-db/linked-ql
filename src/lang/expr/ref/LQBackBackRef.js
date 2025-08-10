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

	static morphsTo() { return registry.LQDeepRef1; }

	/* API */

	operand() { return this.right(); }

	endpoint() { return this.left() instanceof LQBackBackRef ? this.left().endpoint() : this.left(); }

	/* JSON API */

	jsonfy(options = {}, transformer = null, linkedDb = null) {
		if (options.reverseRef) {
			return {
				...(options.nodeNames === false ? {} : { nodeName: registry.LQDeepRef1.NODE_NAME }),
				right: this.left() instanceof registry.LQBackRefEndpoint
					? { nodeName: registry.ColumnRef2.NODE_NAME, value: this.left().value(), delim: this.left()._get('delim') }
					: this.left().jsonfy({ ...options, nodeNames: false }),
				left: this.right().jsonfy({ ...options, nodeNames: false }),
			};
		}
		return super.jsonfy(options, transformer, linkedDb);
	}
}