import { PayloadStmtMixin } from '../abstracts/PayloadStmtMixin.js';
import { DMLStmt } from './DMLStmt.js';
import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';

export class InsertStmt extends PayloadStmtMixin(DMLStmt) {

	/* SYNTAX RULES */

	static get _clause() { return 'INSERT'; }

	static get syntaxRules() {
		const optional_alias_postgres = {
			optional: true,
			syntax: [
				{ type: 'keyword', value: 'AS', booleanfy: true },
				{ type: 'Identifier', as: 'pg_table_alias', assert: true }
			]
		};

		const optional_alias_mysql = {
			optional: true,
			dialect: 'mysql',
			if: ['!select_clause', '!my_table_clause'],
			syntax: [
				{ type: 'keyword', value: 'AS' },
				{ type: 'FromItemAlias', as: 'my_row_alias', assert: true }
			]
		};

		return [
			{ type: 'keyword', value: this._clause },
			{ type: 'keyword', value: 'INTO' },
			{
				assert: true,
				syntax: [
					{
						dialect: 'postgres',
						syntax: [
							{ type: 'TableRef2', as: 'table_ref' },
							{ ...optional_alias_postgres },
							{ type: 'ColumnsConstructor', as: 'column_list', optional: true, autoIndent: true, },
							{
								syntaxes: [
									{ type: 'PGDefaultValuesClause', as: 'pg_default_values_clause' },
									{ type: 'ValuesConstructor', as: 'values_clause' },
									{ type: 'SelectStmt', as: 'select_clause' },
								],
								autoSpacing: '\n'
							},
							...(this._clause === 'INSERT' ? [{ type: 'PGOnConflictClause', as: 'conflict_handling_clause', optional: true, autoSpacing: '\n' }] : []),
							{ type: 'ReturningClause', as: 'returning_clause', optional: true, autoSpacing: '\n' },
						],
					},
					{
						dialect: 'mysql',
						syntax: [
							{ type: 'TableRef2', as: 'table_ref' },
							{ type: 'MYPartitionClause', as: 'my_partition_clause', optional: true, autoIndent: true },
							{
								syntaxes: [
									[
										{ type: 'ColumnsConstructor', as: 'column_list', optional: true, autoIndent: true },
										{
											syntaxes: [
												{ type: 'ValuesConstructor', as: 'values_clause' },
												{ type: 'SelectStmt', as: 'select_clause' },
												{ type: 'TableStmt', as: 'my_table_clause' },
											],
											autoSpacing: '\n'
										},
									],
									{ type: 'SetClause', as: 'my_set_clause', autoSpacing: '\n' },
								],
							},
							{ ...optional_alias_mysql },
							...(this._clause === 'INSERT' ? [{ type: 'MYOnDuplicateKeyUpdateClause', as: 'conflict_handling_clause', optional: true, autoSpacing: '\n' }] : []),
						],
					},
				],
			}
		];
	}

	/* AST API */

	tableRef() { return this._get('table_ref'); }

	columnList() { return this._get('column_list'); }

	valuesClause() { return this._get('values_clause'); }

	selectClause() { return this._get('select_clause'); }

	conflictHandlingClause() { return this._get('conflict_handling_clause'); }

	// -- Postgres

	pgTableAlias() { return this._get('pg_table_alias'); }

	pgDefaultValuesClause() { return this._get('pg_default_values_clause'); }

	returningClause() { return this._get('returning_clause'); }

	// -- MySQL

	myRowAlias() { return this._get('my_row_alias'); }

	myPartitionClause() { return this._get('my_partition_clause'); }

	mySetClause() { return this._get('my_set_clause'); }

	myTableClause() { return this._get('my_table_clause'); }

	/* JSON API */

	jsonfy(options = {}, transformer = null, dbContext = null) {
		if (!options.deSugar) return super.jsonfy(options, transformer, dbContext);

		transformer = new Transformer((node, defaultTransform) => {
			// Process table abstraction nodes
			if (node instanceof registry.TableRef2) {
				let subResultJson = defaultTransform();

				let resultSchema = subResultJson.result_schema;
				if (subResultJson.pg_table_alias) {
					resultSchema = resultSchema.clone({ renameTo: subResultJson.pg_table_alias });
				}

				transformer.statementContext.artifacts.get('tableSchemas').add({ type: 'dml', resultSchema });

				return subResultJson;
			}
			return defaultTransform();
		}, transformer, this/* IMPORTANT */);

		let resultJson = super.jsonfy(options, transformer, dbContext);
		const toDialect = options.toDialect || this.options.dialect;

		// Order ouput JSON
		if (toDialect === 'mysql') {
			resultJson = {
				uuid: resultJson.uuid,
				nodeName: resultJson.nodeName,
				table_ref: resultJson.table_ref,
				my_partition_clause: resultJson.my_partition_clause,
				column_list: resultJson.column_list,
				values_clause: resultJson.values_clause,
				select_clause: resultJson.select_clause,
				my_table_clause: resultJson.my_table_clause,
				my_set_clause: resultJson.my_set_clause,
				my_row_alias: resultJson.my_row_alias,
				conflict_handling_clause: resultJson.conflict_handling_clause,
			};
		} else {
			resultJson = {
				uuid: resultJson.uuid,
				nodeName: resultJson.nodeName,
				table_ref: resultJson.table_ref,
				pg_table_alias: resultJson.pg_table_alias,
				column_list: resultJson.column_list,
				pg_default_values_clause: resultJson.pg_default_values_clause,
				values_clause: resultJson.values_clause,
				select_clause: resultJson.select_clause,
				conflict_handling_clause: resultJson.conflict_handling_clause,
				returning_clause: resultJson.returning_clause,
				result_schema: resultJson.result_schema,
			};
		}

        if (resultJson.conflict_handling_clause?.entries
			&& !resultJson.conflict_handling_clause.entries.length) {
            // All assignments were BackRefs and have been offloaded
            const pkConstraint = resultJson.table_ref.result_schema.pkConstraint(true);
            const pkColumn = pkConstraint.columns()[0];
            resultJson = {
                ...resultJson,
                conflict_handling_clause: {
                    ...resultJson.conflict_handling_clause,
                    entries: [{
                        nodeName: registry.AssignmentExpr.NODE_NAME,
                        left: pkColumn.jsonfy(),
                        operator: '=',
                        right: pkColumn.jsonfy({ toKind: 1 })
                    }],
                },
            };
        }

		if (toDialect === 'postgres'
			&& !resultJson.pg_table_alias
			&& Number(options.deSugar) > 2) {
			resultJson = {
				...resultJson,
				pg_table_alias: {
					nodeName: registry.Identifier.NODE_NAME,
					value: resultJson.table_ref.value,
					delim: resultJson.table_ref.delim
				},
			}
		}

		// 1. Finalize output JSON
		resultJson = this.finalizeOutputJSON(resultJson, transformer, dbContext, options);
		// 2. Finalize generated JOINS. Must come last
		resultJson = this.finalizePayloadJSON(resultJson, transformer, dbContext, options);

		return resultJson;
	}
}