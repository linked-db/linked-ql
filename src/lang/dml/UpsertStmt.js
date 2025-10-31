import { SugarMixin } from '../abstracts/SugarMixin.js';
import { InsertStmt } from './InsertStmt.js';
import { registry } from '../registry.js';
import { _eq } from '../abstracts/util.js';

export class UpsertStmt extends SugarMixin(InsertStmt) {

	/* SYNTAX RULES */

	static get _clause() { return 'UPSERT'; }

	static morphsTo() { return [InsertStmt].concat(super.morphsTo()); }

	/* DESUGARING API */

	finalizePayloadJSON(resultJson, transformer, schemaInference, options) {
		if (resultJson.conflict_handling_clause) {
			throw new Error(`An explicit conflict handling clause is forbidden on the UPSERT statement.`);
		}

		const tableSchema = [...transformer.statementContext.artifacts.get('tableSchemas')].map((t) => t.resultSchema)[0];
		const toDialect = options.toDialect || this.options.dialect;

		let columnNamesJson;
		if (resultJson.my_set_clause) {
			columnNamesJson = resultJson.my_set_clause.entries.map((e) => ({ value: e.left.value, delim: e.left.delim }));
		} else if (resultJson.column_list) {
			columnNamesJson = resultJson.column_list.entries.map((e) => ({ value: e.value, delim: e.delim }));
		} else {
			columnNamesJson = tableSchema.columns().map((c) => c.name().jsonfy({ nodeNames: false }));
		}

		const conflictHandlingClause = {
			nodeName: toDialect === 'mysql'
				? registry.MYOnDuplicateKeyUpdateClause.NODE_NAME
				: registry.PGOnConflictClause.NODE_NAME,
			entries: columnNamesJson.map((c) => ({
				nodeName: registry.AssignmentExpr.NODE_NAME,
				left: {
					nodeName: toDialect === 'mysql'
						? registry.ColumnRef1.NODE_NAME
						: registry.ColumnRef2.NODE_NAME,
					...c,
				},
				operator: '=',
				right: toDialect === 'mysql' ? {
					nodeName: registry.CallExpr.NODE_NAME,
					name: 'VALUES',
					arguments: [{
						nodeName: registry.ColumnRef1.NODE_NAME,
						...c,
					}],
				} : {
					...c,
					nodeName: registry.ColumnRef1.NODE_NAME,
					qualifier: { value: 'EXCLUDED' },
				}
			})),
		};

		if (toDialect === 'postgres') {
			const uniqueKeysColumnSets = [].concat(tableSchema.pkConstraint(true) || []).concat(tableSchema.ukConstraints(true)).map((k) => k.columns().map((c) => c.jsonfy()));
			if (!uniqueKeysColumnSets.length) {
				throw new Error(`Table ${this.tableRef()} has no unique keys defined to process an UPSERT operation. You may want to perform a direct INSERT operation.`);
			}

			const firstUniqueKeysColumnSet = uniqueKeysColumnSets.find((colSet) => colSet.find((k) => columnNamesJson.find((c) => _eq(k.value, c.value, k.delim || c.delim)))) || uniqueKeysColumnSets[0];

			conflictHandlingClause.conflict_target = {
				nodeName: registry.PGConflictTarget.NODE_NAME,
				index_list: firstUniqueKeysColumnSet.map((c) => ({
					nodeName: registry.PGConflictTargetIndexSpec.NODE_NAME,
					column_name: c
				})),
			};
		}
		
		return super.finalizePayloadJSON({
			...resultJson,
			nodeName: InsertStmt.NODE_NAME,
			conflict_handling_clause: conflictHandlingClause
		}, transformer, schemaInference, options);
	}
}