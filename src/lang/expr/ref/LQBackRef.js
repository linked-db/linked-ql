import { LQBackBackRef } from './LQBackBackRef.js';
import { ErrorFKInvalid } from './abstracts/ErrorFKInvalid.js';
import { ErrorRefAmbiguous } from './abstracts/ErrorRefAmbiguous.js';
import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { registry } from '../../registry.js';

const {
	ColumnRef,
	TableRef,
} = registry;

export class LQBackRef extends LQBackBackRef {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return [
			{ type: this._leftType, as: 'left', peek: [1, 'operator', '<~'] },
			{ type: 'operator', value: '<~' },
			{ type: 'TableRef', as: 'right' }
		];
	}

	static get syntaxPriority() { return 0; }

	/* SCHEMA API */

	deriveSchema(linkedDb) { return this.right().deriveSchema(linkedDb)/* TableSchema */; }

	getOperands(linkedDb) {
		const left = this.left();

		const leftEndpoint = left instanceof LQBackBackRef
			? left.endpoint()
			: left;
		const leftFk = leftEndpoint.deriveSchema(linkedDb)/* ColumnSchema */.fkConstraint();
		if (!leftFk) throw new ErrorFKInvalid(`[${this.parentNode || this}]: Column ${leftEndpoint} is not a foreign key.`);
		const leftEndpointTable = leftFk.targetTable();

        let statementNode = this.statementNode;
		if (!statementNode) throw new ErrorRefUnknown(`[${this.parentNode || this}]: Ref not associated with a statement.`);

		let keyLeft_ref;
        do {
            const querySchemasSchemaInScope = statementNode.querySchemas();
			for (const [/*alias*/, tableRefOrConstructor] of querySchemasSchemaInScope) {
				if (!(tableRefOrConstructor instanceof TableRef)) continue;
				if (!tableRefOrConstructor.identifiesAs(leftEndpointTable, leftEndpoint._has('delim'))) continue;
				const pkColumnName = tableRefOrConstructor.deriveSchema(linkedDb)/* TableSchema */.pkConstraint(true)?.columns()[0];
				if (!pkColumnName) continue;
				const $keyLeft_ref = ColumnRef.fromJSON({
					qualifier: tableRefOrConstructor.jsonfy({ nodeNames: false }, null, linkedDb),
					value: pkColumnName
				});
				if (keyLeft_ref) throw new ErrorRefAmbiguous(`[${this.parentNode || this}]: Target primary key for foreign key ${leftEndpoint} is ambiguous. (Is it ${keyLeft_ref} or ${$keyLeft_ref}?)`);
				keyLeft_ref = $keyLeft_ref;
			}
        } while (!keyLeft_ref && (statementNode = statementNode.parentNode?.statementNode));

		if (!keyLeft_ref) {
			throw new ErrorRefUnknown(`LQBackRef ${this.parentNode || this} could not be resolved against table query.`);
		}

		const targetTable_ref = this.right().clone({ fullyQualified: true }, null, linkedDb);
		const keyRight_ref = left instanceof LQBackBackRef
			? left.clone({ reverseRef: true })
			: left.clone();

		return {
			table: targetTable_ref,
			left: keyLeft_ref,
			right: keyRight_ref,
		};
	}
}
