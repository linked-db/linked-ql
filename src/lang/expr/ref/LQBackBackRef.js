import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { ErrorFKInvalid } from './abstracts/ErrorFKInvalid.js';
import { registry } from '../../registry.js';

export class LQBackBackRef extends AbstractMagicRef {

	/* SYNTAX RULES */

	static get _leftType() { return ['ColumnRef'/* must come first to prevent left-recursion */, 'LQBackBackRef']; } // for inheritance

	static get syntaxRules() {
		return [
			{ type: this._leftType, as: 'left', peek: [1, 'operator', '<~'] },
			{ type: 'operator', value: '<~' },
			{ type: 'ColumnNameRef', as: 'right', peek: [1, 'operator', '<~'] },
		];
	}

	static get syntaxPriority() { return 1; }

	static morphsTo() { return registry.LQDeepRef; }

	/* DESUGARING API */
	
	jsonfy(options = {}, transformCallback = null, linkedDb = null) {
		if (options.reverseRef) {
			return {
				...(options.nodeNames === false ? {} : { nodeName: registry.LQDeepRef.NODE_NAME }),
				left: this.right().jsonfy({ ...options, nodeNames: false }, null, linkedDb),
				right: this.left().jsonfy({ ...options, nodeNames: false }, null, linkedDb),
			};
		}
		return super.jsonfy(options, transformCallback, linkedDb);
	}

	/* SCHEMA API */

	deriveSchema(linkedDb) {
		const fk = this.right().deriveSchema(linkedDb)/* ColumnSchema */.fkConstraint(true);
		if (!fk) throw new ErrorFKInvalid(`[${this.parentNode || this}] Column ${this.right()} is not a foreign key.`);
		return fk.targetTable()/*the table in there*/.deriveSchema(linkedDb)/* TableSchema */;
	}

	endpoint() { return this.left() instanceof LQBackBackRef ? this.left().endpoint() : this.left(); }
}