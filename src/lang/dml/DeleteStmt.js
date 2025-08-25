import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { registry } from '../registry.js';

export class DeleteStmt extends SelectorStmtMixin(
    AbstractNonDDLStmt
) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'DELETE' },
            {
                assert: true,
                syntaxes: [
                    {
                        dialect: 'postgres',
                        syntax: [
                            { type: 'keyword', value: 'FROM' },
                            { type: 'TableAbstraction2', as: 'table_expr' },
                            { type: 'UsingFromClause', as: 'using_clause', optional: true, autoIndent: true },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
                            { type: ['PGWhereCurrentClause', 'WhereClause'], as: 'where_clause', optional: true, autoIndent: true },
                            { type: 'ReturningClause', as: 'returning_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'TableAbstraction1', as: 'my_delete_list', arity: { min: 1 }, itemSeparator },
                            { type: 'FromClause', as: 'my_from_clause', autoIndent: true },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'keyword', value: 'FROM' },
                            { type: 'TableAbstraction1', as: 'my_delete_list', arity: { min: 1 }, itemSeparator },
                            { type: 'UsingFromClause', as: 'using_clause', autoIndent: true },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'keyword', value: 'FROM' },
                            { type: 'TableAbstraction2', as: 'table_expr' },
                            { type: 'MYPartitionClause', as: 'my_partition_clause', optional: true, autoIndent: true },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                            { type: 'OrderByClause', as: 'my_order_by_clause', optional: true, dialect: 'mysql', autoIndent: true },
                            { type: 'LimitClause', as: 'my_limit_clause', optional: true, dialect: 'mysql', autoIndent: true },
                        ],
                    }
                ],
            },
        ];
    }

    /* AST API */

    tableExpr() { return this._get('table_expr'); }

    usingClause() { return this._get('using_clause'); }

    joinClauses() { return this._get('join_clauses'); }

    whereClause() { return this._get('where_clause'); }

    // -- Postgres

    returningClause() { return this._get('returning_clause'); }

    // -- MySQL

    myPartitionClause() { return this._get('my_partition_clause'); }

    myDeleteList() { return this._get('my_delete_list'); }

    myFromClause() { return this._get('my_from_clause'); }

    myOrderByClause() { return this._get('my_order_by_clause'); }

    myLimitClause() { return this._get('my_limit_clause'); }

    /* SCHEMA API */

    querySchemas() {
        // Literally inherit inheritedQuerySchemas
        inheritedQuerySchemas = new Set(inheritedQuerySchemas || []);

        const resultSchemas = new Set;

        const deriveSchema = (aliasName, tableRef) => {
            const alias = registry.Identifier.fromJSON({ value: aliasName });
            const tableSchema = tableRef.resultSchema(transformer).clone({ renameTo: alias });
            inheritedQuerySchemas.add(tableSchema);
            resultSchemas.add(tableSchema);
        };

        if (this.tableExpr()) {
            // Syntaxes 1 & 4
            const tableExpr = this.tableExpr();
            const tableRef = tableExpr.tableRef();
            deriveSchema(
                tableExpr.alias()?.value() || tableRef.value(),
                tableRef
            );
        } else if (this.myDeleteList()?.length) {
            // Syntaxes 2 & 3
            for (const myDeleteExpr of this.myDeleteList()) {
                const tableRef = myDeleteExpr.tableRef();
                deriveSchema(
                    tableRef.value(),
                    tableRef
                );
            }
        }

        if (this.usingClause()) {
            // Syntaxes 1 & 3
            for (const fromElement of this.usingClause()) {
                const fromExpr = fromElement.expr(); // TableRef1 or DerivedQuery, etc.
                deriveSchema(
                    fromElement.alias()?.value() || fromExpr.value(),
                    fromExpr
                );
            }
        } else if (this.myFromClause()) {
            // Syntax 2
            for (const fromElement of this.myFromClause()) {
                const fromExpr = fromElement.expr();
                deriveSchema(
                    fromElement.alias()?.value() || fromExpr.value(),
                    fromExpr
                );
            }
        }

        if (this.joinClauses()) {
            // Syntax 1, 2, & 3
            for (const fromElement of this.joinClauses()) {
                const fromExpr = fromElement.expr(); // TableRef1 or DerivedQuery, etc.
                deriveSchema(
                    fromElement.alias()?.value() || fromExpr.value(),
                    fromExpr
                );
            }
        }

        return resultSchemas;
    }

    /* DESUGARING API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (options.deSugar) {
            const rands = options.rands || new Map;
            const hashes = new Map;
            options = { ...options, rands, hashes };
        }
        return super.jsonfy(options, transformer, linkedDb);
    }

    finalizeSelectorJSON(resultJson, transformer, linkedDb, options) {
        if (this.options.dialect !== 'postgres') {
            // Redirect finalization to the standard finalization logic
            return super.finalizeSelectorJSON(resultJson, transformer, linkedDb, options);
        }

        const {
            FromItem,
            TableAbstraction2,
            SelectItemAlias,
            FromItemAlias,
            TableRef2,
            TableRef1,
            ColumnRef1,
            SelectItem,
            FromClause,
            CompleteSelectStmt,
            DerivedQuery,
            BinaryExpr,
        } = registry;

        if (resultJson.where_clause?.cursor_name) {
            throw new Error(`Deep/Back Refs are currently not supported with a "WHERE CURRENT OF..." statement`);
        }

        const rand = this._rand('rand');

        // Rewrite to a "WHERE IN ( SELECT ... )" logic
        // moving the existing WHERE clause, if any, into the subquery

        const tblRefOriginal = resultJson.table_expr.name.value;
        const tblAliasOriginal = resultJson.table_expr.alias ? resultJson.table_expr.alias.value : resultJson.table_expr.name.value;
        const tblAliasRewrite = `${rand}::${tblAliasOriginal}`;
        const whereClauseOriginal = resultJson.where_clause;
        const pk = this.table().resultSchema(transformer, true)/* TableSchema */.pkConstraint(true)?.columns()[0];
        if (!pk) throw new Error(``);

        // The re-write...
        resultJson = {
            ...resultJson,
            table_expr: {
                nodeName: TableAbstraction2.NODE_NAME,
                name: { nodeName: TableRef2.NODE_NAME, value: tblRefOriginal },
                alias: { nodeName: SelectItemAlias.NODE_NAME, value: tblAliasRewrite }
            },
            where_clause: {
                nodeName: BinaryExpr.NODE_NAME,
                left: {
                    nodeName: ColumnRef1.NODE_NAME,
                    qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasRewrite },
                    value: pk,
                },
                operator: 'IN',
                right: {
                    nodeName: DerivedQuery.NODE_NAME,
                    expr: {
                        // SELECT <...>
                        nodeName: CompleteSelectStmt.NODE_NAME,
                        select_list: {
                            nodeName: SelectList.NODE_NAME,
                            entries: [{
                                nodeName: SelectItem.NODE_NAME,
                                expr: { nodeName: ColumnRef1.NODE_NAME, value: pk }
                            }],
                        },
                        from_clause: {
                            // FROM <tblRefOriginal>
                            nodeName: FromClause.NODE_NAME,
                            entries: [{
                                nodeName: FromItem.NODE_NAME,
                                expr: { nodeName: TableRef2.NODE_NAME, value: tblRefOriginal },
                                alias: { nodeName: FromItemAlias.NODE_NAME, value: tblAliasOriginal }
                            }]
                        },
                        where_clause: whereClauseOriginal,
                        join_clauses: [...selectorDimensions].map((d) => d.query),
                    },
                }

            }
        };

        return resultJson;
    }
}