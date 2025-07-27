import { LQBackBackRef } from './LQBackBackRef.js';
import { ErrorFKInvalid } from './abstracts/ErrorFKInvalid.js';
import { registry } from '../../registry.js';

const {
	ComputedColumnRef,
	ClassicTableRef,
} = registry;

export class LQBackRef extends LQBackBackRef {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return [
			{ type: this._leftType, as: 'left', peek: [1, 'operator', '<~'] },
			{ type: 'operator', value: '<~' },
			{ type: 'ClassicTableRef', as: 'right' }
		];
	}

	static get syntaxPriority() { return 0; }

	/* SYSTEM HOOKS */

	_capture(requestName, requestSource) {
		if (requestName === 'CONTEXT.TABLE_SCHEMA') {
			return this.tableSchema();
		}
		return super._capture(requestName, requestSource);
	}

	/* API */

	tableSchema() { return this.right().tableSchema(); }

	getOperands() {
		let keyLeft_ref, keyRight_ref;
		const left = this.left();
		const leftEndpoint = left instanceof LQBackBackRef
			? left.endpoint()
			: left;
		const leftFk = leftEndpoint.columnSchema().foreignKey();
		if (!leftFk) throw new ErrorFKInvalid(`[${this}]: Column ${leftEndpoint.clone()} is not a foreign key.`);
		const leftEndpointTable = leftFk.targetTable();
		const querySchema = this.capture('CONTEXT.QUERY_SCHEMA'); // Intentionally using capture here
		for (const $col of querySchema/*query*/.columns()) {
			if (!$col.primaryKey()) continue;
			if ($col.qualifier(true).identifiesAs(leftEndpointTable)) {
				const $keyLeft_ref = ComputedColumnRef.fromJSON({
					qualifier: $col.parentSchema(true).name(),
					value: $col.name()
				});
				if (keyLeft_ref) throw new Error(`[${this}]: Target primary key for foreign key ${leftEndpoint.clone()} is ambiguous. (Is it ${keyLeft_ref} or ${$keyLeft_ref}?)`);
				keyLeft_ref = $keyLeft_ref;
			}
		}
		if (!keyLeft_ref) {
			if (0) {
				// TODO
			} else throw new Error(`LQBackRef ${this} could not be resolved against table query.`);
		}
		keyRight_ref = left instanceof LQBackBackRef
			? left.clone({ reverseRef: true })
			: left.clone();
		const targetTable_schema = this.tableSchema();
		const targetTable_ref = ClassicTableRef.fromJSON({
			qualifier: targetTable_schema.parentSchema(true).name(),
			value: targetTable_schema.name()
		});
		return {
			table: targetTable_ref,
			left: keyLeft_ref,
			right: keyRight_ref,
		};
	}
}
