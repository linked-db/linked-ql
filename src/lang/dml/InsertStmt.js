import { PayloadStmtMixin } from '../abstracts/PayloadStmtMixin.js';
import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';

export class InsertStmt extends PayloadStmtMixin(
	AbstractNonDDLStmt
) {

	/* SYNTAX RULES */

	static get _clause() { return 'INSERT'; }

	static get syntaxRules() {
		const itemSeparator = { type: 'punctuation', value: ',' };
		const optional_alias_mysql = {
			optional: true,
			dialect: 'mysql',
			if: ['!select_clause', '!my_table_clause'],
			syntax: [
				{ type: 'keyword', value: 'AS' },
				{ type: 'CompositeAlias', as: 'my_alias', assert: true }
			]
		};
		return [
			{ type: 'keyword', value: this._clause },
			{ type: 'keyword', value: 'INTO' },
			{
				dialect: 'postgres',
				syntax: [
					{ type: 'BasicTableExpr', as: 'table_expr' },
					{ type: 'ColumnsConstructor', as: 'column_list', arity: { min: 1 }, itemSeparator, optional: true, autoIndent: 2 },
					{
						syntaxes: [
							{ type: 'PGDefaultValuesClause', as: 'pg_default_values_clause', autoIndent: true },
							{ type: 'ValuesConstructor', as: 'values_clause', autoIndent: true },
							{ type: 'SelectStmt', as: 'select_clause', autoIndent: true },
						],
					},
					...(this._clause === 'INSERT' ? [{ type: 'PGOnConflictClause', as: 'conflict_handling_clause', optional: true, autoIndent: true }] : []),
					{ type: 'PGReturningClause', as: 'pg_returning_clause', optional: true, autoIndent: true },
				],
			},
			{
				dialect: 'mysql',
				syntax: [
					{ type: 'ClassicTableRef', as: 'table_expr' },
					{ type: 'MYPartitionClause', as: 'my_partition_clause', optional: true, autoIndent: true },
					{
						syntaxes: [
							[
								{ type: 'ColumnsConstructor', as: 'column_list', arity: { min: 1 }, itemSeparator, optional: true, autoIndent: 2 },
								{
									syntaxes: [
										{ type: 'ValuesConstructor', as: 'values_clause', autoIndent: true },
										{ type: 'SelectStmt', as: 'select_clause', autoIndent: true },
										{ type: 'TableStmt', as: 'my_table_clause', autoIndent: true },
									]
								},
							],
							{ type: 'SetClause', as: 'my_set_clause', autoIndent: true },
						],
					},
					{ ...optional_alias_mysql },
					...(this._clause === 'INSERT' ? [{ type: 'MYOnDuplicateKeyUpdateClause', as: 'conflict_handling_clause', optional: true, autoIndent: true }] : []),
				],
			},
		];
	}

	/* AST API */

	tableExpr() { return this._get('table_expr'); }

	columnList() { return this._get('column_list'); }

	valuesClause() { return this._get('values_clause'); }

	selectClause() { return this._get('select_clause'); }

	conflictHandlingClause() { return this._get('conflict_handling_clause'); }

	// -- Postgres

	pgDefaultValuesClause() { return this._get('pg_default_values_clause'); }

	pgPGReturningClause() { return this._get('pg_returning_clause'); }

	// -- MySQL

	myAlias() { return this._get('my_alias'); }

	myPartitionClause() { return this._get('my_partition_clause'); }

	mySetClause() { return this._get('my_set_clause'); }

	myTableClause() { return this._get('my_table_clause'); }
}