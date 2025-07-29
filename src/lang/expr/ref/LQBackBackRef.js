import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { ErrorFKInvalid } from './abstracts/ErrorFKInvalid.js';
import { registry } from '../../registry.js';

const {
	LQDeepRef,
} = registry;

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

	static morphsTo() { return LQDeepRef; }

	/* DESUGARING API */
	
	jsonfy(options = {}, transformCallback = null, linkedDb = null) {
		if (options.reverseRef) {
			return {
				nodeName: LQDeepRef.NODE_NAME,
				left: this.right().jsonfy(options, null, linkedDb),
				right: this.left().jsonfy(options, null, linkedDb),
			};
		}
		return super.jsonfy(options, transformCallback, linkedDb);
	}

	/* SYSTEM HOOKS */

	_capture(requestName, requestSource) {
		if (requestName === 'CONTEXT.TABLE_SCHEMA' && requestSource === this.left()) {
			return this.tableSchema();
		}
		return super._capture(requestName, requestSource);
	}

	/* API */

	tableSchema() {
		const fk = this.right().columnSchema().fkConstraint();
		if (!fk) throw new ErrorFKInvalid(`[${this.parentNode || this}]: Column ${this.right()} is not a foreign key.`);
		return fk.targetTable()/*the table in there*/.tableSchema();
	}

	endpoint() { return this.left() instanceof LQBackBackRef ? this.left().endpoint() : this.left(); }
}