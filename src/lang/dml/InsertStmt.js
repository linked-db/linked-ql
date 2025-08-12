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
				{ type: 'FromItemAlias', as: 'my_alias', assert: true }
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
							{ type: 'TableAbstraction2', as: 'pg_table_expr' },
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
							{ type: 'TableRef1', as: 'my_table_ref' },
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
				],
			}
		];
	}

	/* AST API */

	columnList() { return this._get('column_list'); }

	valuesClause() { return this._get('values_clause'); }

	selectClause() { return this._get('select_clause'); }

	conflictHandlingClause() { return this._get('conflict_handling_clause'); }

	// -- Postgres

	pgTableExpr() { return this._get('pg_table_expr'); }

	pgDefaultValuesClause() { return this._get('pg_default_values_clause'); }

	pgPGReturningClause() { return this._get('pg_returning_clause'); }

	// -- MySQL

	myTableRef1() { return this._get('pg_table_ref'); }

	myAlias() { return this._get('my_alias'); }

	myPartitionClause() { return this._get('my_partition_clause'); }

	mySetClause() { return this._get('my_set_clause'); }

	myTableClause() { return this._get('my_table_clause'); }

	/* SCHEMA API */

	querySchemas() {
		const resultSchemas = new Set;

		const deriveSchema = (aliasName, tableRef) => {
			const alias = registry.Identifier.fromJSON({ value: aliasName });
			const tableSchema = tableRef.resultSchema(transformer).clone({ renameTo: alias });
			resultSchemas.add(tableSchema);
		};

		if (this.pgTableExpr()) {
			// For Postgres, the tableExpr is a TableAbstraction2, which may have an alias
			const tableExpr = this.pgTableExpr();
			const tableRef = tableExpr.tableRef();
			deriveSchema(
				tableExpr.alias()?.value() || tableRef.value(),
				tableRef
			);
		} else if (this.myTableRef1()) {
			// For MySQL, the tableExpr is a TableRef1, which may not have an alias
			const tableRef = this.myTableRef1();
			deriveSchema(
				this.myAlias()?.value() || tableRef.value(),
				tableRef
			);
		}

		return resultSchemas;
	}

	/* JSON API */

	jsonfy(options = {}, transformer = null, linkedDb = null) {
		if (options.deSugar) {
			const rands = options.rands || new Map;
			const hashes = new Map;
			options = { ...options, rands, hashes };
		}
		return super.jsonfy(options, transformer, linkedDb);
	}
}