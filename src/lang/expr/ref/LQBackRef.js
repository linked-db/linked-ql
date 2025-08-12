import { LQBackBackRef } from './LQBackBackRef.js';
import { ErrorFKInvalid } from './abstracts/ErrorFKInvalid.js';
import { ErrorRefAmbiguous } from './abstracts/ErrorRefAmbiguous.js';
import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { registry } from '../../registry.js';

export class LQBackRef extends LQBackBackRef {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return [
			{ type: this._leftType, as: 'left', peek: [1, 'operator', '<~'] },
			{ type: 'operator', value: '<~' },
			{ type: 'TableRef2', as: 'right' }
		];
	}

	static get syntaxPriority() { return 0; }

	/* SCHEMA API */

	rhsTable(transformer, linkedDb) {
		if (!linkedDb) return;
		const tableRefs = this.right()?.lookup(null, null/*transformer*/, linkedDb) || [];
		if (!tableRefs.length) {
			throw new ErrorRefUnknown(`[${this.parentNode || this}] Implied RHS table ${this.right()} does not exist.`);
		}
		return tableRefs[0];
	}

	resolve(transformer, linkedDb) {
		if (!transformer || !linkedDb) return;
		const left = this.left();

		const qualifiedLeftEndpoint = left instanceof LQBackBackRef
			? left.endpoint()
			: left;
		const leftEndpointQualifier = qualifiedLeftEndpoint.qualifier();

		const unqualifiedLeftEndpoint = leftEndpointQualifier
			? registry.ColumnRef2.fromJSON({ ...qualifiedLeftEndpoint.jsonfy({ nodeNames: false }), qualifier: undefined })
			: qualifiedLeftEndpoint;

		const resolvedLeftEndpoint = qualifiedLeftEndpoint/* original */.resolve(transformer, linkedDb);

		const leftFk = resolvedLeftEndpoint.resultSchema()/* ColumnSchema */.fkConstraint(true);
		if (!leftFk) throw new ErrorFKInvalid(`[${this.parentNode || this}] Endpoint column ${unqualifiedLeftEndpoint} is not a foreign key.`);
		const leftEndpointTable = leftFk.targetTable();

		let qualifiedLeftOperand;
		const resolve = (ddlName, tableSchema) => {
			const pkColumnRef2 = tableSchema.pkConstraint(true)?.columns()[0]?.resolve(transformer, linkedDb);
			if (!pkColumnRef2) throw new ErrorFKInvalid(`[${this.parentNode || this}] The referenced LHS table ${ddlName} does not have a primary key.`);

			const $qualifiedLeftOperand = registry.ColumnRef1.fromJSON({
				qualifier: { ...tableSchema.name().jsonfy({ nodeNames: false }), result_schema: tableSchema },
				value: pkColumnRef2.value(),
				delim: pkColumnRef2._get('delim'),
				result_schema: pkColumnRef2.resultSchema()
			});

			if (qualifiedLeftOperand) throw new ErrorRefAmbiguous(`[${this.parentNode || this}]: The referenced endpoint for foreign key ${unqualifiedLeftEndpoint} is ambiguous. (Is it ${qualifiedLeftOperand} or ${$qualifiedLeftOperand}?)`);
			qualifiedLeftOperand = $qualifiedLeftOperand;
		};

		let statementContext = transformer.statementContext
		outer: do {
			for (const { result_schema: tableSchema } of statementContext.artifacts.get('tableSchemas')) {
				const ddlName = tableSchema._get('ddl_name') || tableSchema.name(); // Must match leftEndpointTable
				if (leftEndpointQualifier) {
					if (!tableSchema.identifiesAs(leftEndpointQualifier)) continue;
					if (!leftEndpointTable.identifiesAs(ddlName)) {
						throw new ErrorFKInvalid(`[${this.parentNode || this}] The endpoint table implied by ${leftEndpointQualifier} (${ddlName}) is not the actual target (${leftEndpointTable}) of the foreign key column ${unqualifiedLeftEndpoint}.`);
					}
					resolve(ddlName, tableSchema);
					break outer;
				} else if (leftEndpointTable.identifiesAs(ddlName)) {
					resolve(ddlName, tableSchema);
				}
			}
		} while (!qualifiedLeftOperand && (statementContext = statementContext.superContext?.statementContext))

		if (!qualifiedLeftOperand) {
			throw new ErrorRefUnknown(`[${this.parentNode || this}] Ref does not correlate with current query.`);
		}

		const qualifiedRightTable = this.rhsTable(transformer, linkedDb);
		const unqualifiedRightOperand = left instanceof LQBackBackRef
			? left.clone({ reverseRef: true })
			: registry.ColumnRef2.fromJSON({
				value: unqualifiedLeftEndpoint.value(),
				delim: unqualifiedLeftEndpoint._get('delim'),
				result_schema: qualifiedRightTable.resultSchema()._get('entries', unqualifiedLeftEndpoint)
			});

		return {
			lhsOperand: qualifiedLeftOperand, // ColumnRef1
			rhsOperand: unqualifiedRightOperand, // ColumnRef2
			rhsTable: qualifiedRightTable, // TableRef2
		};
	}
}
