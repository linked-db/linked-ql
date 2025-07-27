import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { registry } from '../registry.js';

const {
    FromElement,
    BasicTableExpr,
    ClassicTableRef,
    BasicAlias,
    CompositeAlias,
    ComputedTableRef,
    ComputedColumnRef,
    SelectElement,
    FromClause,
    CompleteSelectStmt,
    SubqueryConstructor,
    BinaryExpr,
} = registry;

export class DeleteStmt extends SelectorStmtMixin(
    AbstractNonDDLStmt
) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'DELETE' },
            {
                syntaxes: [
                    {
                        dialect: 'postgres',
                        syntax: [
                            { type: 'keyword', value: 'FROM' },
                            { type: 'BasicTableExpr', as: 'table_expr' },
                            { type: 'UsingFromClause', as: 'using_clause', optional: true, autoIndent: true },
                            { type: 'JoinClause', as: 'join_clause', optional: true, autoIndent: true },
                            { type: ['PGWhereCurrentClause', 'WhereClause'], as: 'where_clause', optional: true, autoIndent: true },
                            { type: 'PGReturningClause', as: 'pg_returning_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'MYStarredTableRef', as: 'my_delete_list', arity: { min: 1 }, itemSeparator },
                            { type: 'FromClause', as: 'my_from_clause', autoIndent: true },
                            { type: 'JoinClause', as: 'join_clause', optional: true, autoIndent: true },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'keyword', value: 'FROM' },
                            { type: 'MYStarredTableRef', as: 'my_delete_list', arity: { min: 1 }, itemSeparator },
                            { type: 'UsingFromClause', as: 'using_clause', autoIndent: true },
                            { type: 'JoinClause', as: 'join_clause', optional: true, autoIndent: true },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'keyword', value: 'FROM' },
                            { type: 'BasicTableExpr', as: 'table_expr' },
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

    joinClause() { return this._get('join_clause'); }

    whereClause() { return this._get('where_clause'); }

    // -- Postgres

    pgPGReturningClause() { return this._get('pg_returning_clause'); }

    // -- MySQL

    myPartitionClause() { return this._get('my_partition_clause'); }

    myDeleteList() { return this._get('my_delete_list'); }

    myFromClause() { return this._get('my_from_clause'); }

    myOrderByClause() { return this._get('my_order_by_clause'); }

    myLimitClause() { return this._get('my_limit_clause'); }

    /* DESUGARING API */

    applySelectorDimensions(resultJson, selectorDimensions, options) {
        // This is Postgres-specific
        if (this.options.dialect !== 'postgres') {
            return super/* SelectorStmtMixin */.applySelectorDimensions(resultJson, selectorDimensions, options);
        }

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
        const pk = this.table().tableSchema().primaryKey().columns()[0];

        // The re-write...
        resultJson = {
            ...resultJson,
            table_expr: {
                nodeName: BasicTableExpr.NODE_NAME,
                name: { nodeName: ClassicTableRef.NODE_NAME, value: tblRefOriginal },
                alias: { nodeName: BasicAlias.NODE_NAME, value: tblAliasRewrite }
            },
            where_clause: {
                nodeName: BinaryExpr.NODE_NAME,
                left: {
                    nodeName: ComputedColumnRef.NODE_NAME,
                    qualifier: { nodeName: ComputedTableRef.NODE_NAME, value: tblAliasRewrite },
                    value: pk,
                },
                operator: 'IN',
                right: {
                    nodeName: SubqueryConstructor.NODE_NAME,
                    expr: {
                        // SELECT <...>
                        nodeName: CompleteSelectStmt.NODE_NAME,
                        select_list: [{
                            nodeName: SelectElement.NODE_NAME,
                            expr: { nodeName: ComputedColumnRef.NODE_NAME, value: pk }
                        }],
                        from_clause: {
                            // FROM <tblRefOriginal>
                            nodeName: FromClause.NODE_NAME,
                            entries: [{
                                nodeName: FromElement.NODE_NAME,
                                expr: { nodeName: ClassicTableRef.NODE_NAME, value: tblRefOriginal },
                                alias: { nodeName: CompositeAlias.NODE_NAME, value: tblAliasOriginal }
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