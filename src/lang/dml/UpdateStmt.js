import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { PayloadStmtMixin } from '../abstracts/PayloadStmtMixin.js';
import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { registry } from '../registry.js';

export class UpdateStmt extends PayloadStmtMixin/* Must be outer as can morph to a CTE */(SelectorStmtMixin(
    AbstractNonDDLStmt
)) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'UPDATE' },
            {
                assert: true,
                syntaxes: [
                    {
                        dialect: 'postgres',
                        syntax: [
                            { type: 'TableAbstraction2', as: 'table_expr' },
                            { type: 'SetClause', as: 'set_clause' },
                            { type: 'FromClause', as: 'pg_from_clause', optional: true, dialect: 'postgres', autoIndent: true },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
                            { type: ['PGWhereCurrentClause', 'WhereClause'], as: 'where_clause', optional: true, autoIndent: true },
                            { type: 'PGReturningClause', as: 'pg_returning_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'TableAbstraction2', as: 'table_expr' },
                            { type: 'SetClause', as: 'set_clause' },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                            { type: 'OrderByClause', as: 'my_order_by_clause', optional: true, autoIndent: true },
                            { type: 'LimitClause', as: 'my_limit_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'TableAbstraction1', as: 'my_update_list', arity: { min: 1 }, itemSeparator },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
                            { type: 'SetClause', as: 'set_clause' },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                        ],
                    },
                ]
            }
        ];
    }

    /* AST API */

    tableExpr() { return this._get('table_expr'); }

    joinClauses() { return this._get('join_clauses'); }

    setClause() { return this._get('set_clause'); }

    whereClause() { return this._get('where_clause'); }

    // Postgres

    pgFromClause() { return this._get('pg_from_clause'); }

    pgPGReturningClause() { return this._get('pg_returning_clause'); }

    // MySQL

    myUpdateList() { return this._get('my_update_list'); }

    myOrderByClause() { return this._get('my_order_by_clause'); }

    myLimitClause() { return this._get('my_limit_clause'); }

    /* SCHEMA API */

    querySchemas() {
        // Literally inherit inheritedQuerySchemas
        inheritedQuerySchemas = new Set(inheritedQuerySchemas || []);

        const resultSchemas = new Set;

        const deriveSchema = (aliasName, tableRef) => {
            const alias = registry.Identifier.fromJSON({ value: aliasName });
            const tableSchema = tableRef.ddlSchema(transformer).clone({ renameTo: alias });
            inheritedQuerySchemas.add(tableSchema);
            resultSchemas.add(tableSchema);
        };

        if (this.tableExpr()) {
            // Syntaxes 1 & 2
            const tableExpr = this.tableExpr();
            const tableRef = tableExpr.tableRef();

            deriveSchema(
                tableExpr.alias()?.value() || tableRef.value(),
                tableRef
            );

            if (this.pgFromClause()) {
                // Syntax 1
                for (const fromElement of this.pgFromClause()) {
                    const fromExpr = fromElement.expr(); // TableRef1 or DerivedQuery, etc.
                    deriveSchema(
                        fromElement.alias()?.value() || fromExpr.value(),
                        fromExpr
                    );
                }
            }
        } else if (this.myUpdateList()?.length) {
            // Syntax 3
            for (const myUpdateExpr of this.myUpdateList()) {
                const tableRef = myUpdateExpr.tableRef();
                deriveSchema(
                    tableRef.value(),
                    tableRef
                );
            }
        }

        if (this.joinClauses()?.length) {
            // Syntaxes 1 & 3
            for (const fromElement of this.joinClauses()) {
                const fromExpr = fromElement.expr();
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

    applySelectorDimensions(resultJson, selectorDimensions, options, transformer = null, linkedDb = null) {
        // This is Postgres-specific
        if (this.options.dialect !== 'postgres') {
            return super/* SelectorStmtMixin */.applySelectorDimensions(resultJson, selectorDimensions, options, transformer, linkedDb);
        }

        if (resultJson.where_clause?.cursor_name) {
            throw new Error(`Deep/Back Refs are currently not supported with a "WHERE CURRENT OF..." statement`);
        }

        const {
            DerivedQuery,
            CompleteSelectStmt,
            SelectItem,
            BasicAlias,
            CompositeAlias,
            FromClause,
            WhereClause,
            ColumnRef1,
            TableRef1,
            TableRef2,
            BinaryExpr,
            TableAbstraction3,
        } = registry;

        const rand = this._rand('rand');

        // Each table involved in a Deep/BackRef should have a corresponding entry
        // in the "FROM" list where we have the chance to establish our JOIN
        // with a corresponding extra "WHERE" clause that correlates the generated table with the original table

        let pgGeneratedFromEntry;
        const createOrPatchAFromEntry = (columnRef) => {

            const tableExpr = resultJson.table_expr;
            const tblRefOriginal = tableExpr.name.value;
            const tblAliasOriginal = tableExpr.alias ? tableExpr.alias.value : tableExpr.name.value;
            const colRefOriginal = columnRef.value;

            if (columnRef.qualifier.value !== tblAliasOriginal) return columnRef;

            const tblAliasRewrite = `${rand}::${tblAliasOriginal}`;
            const colRefRewrite = `${rand}::${colRefOriginal}`;

            if (!pgGeneratedFromEntry) {
                // Compose:
                // - ( SELECT [] FROM <tblRefOriginal> )
                // - AS <tblAliasRewrite>
                const fromElement = {
                    nodeName: TableAbstraction3.NODE_NAME,
                    expr: {
                        nodeName: DerivedQuery.NODE_NAME,
                        expr: {
                            // SELECT <...>
                            nodeName: CompleteSelectStmt.NODE_NAME,
                            select_list: [],
                            pg_from_clause: {
                                // FROM <tblRefOriginal>
                                nodeName: FromClause.NODE_NAME,
                                entries: [{
                                    nodeName: TableAbstraction3.NODE_NAME,
                                    expr: { nodeName: TableRef1.NODE_NAME, value: tblRefOriginal }
                                }]
                            },
                        },
                    },
                    // AS <tblAliasRewrite>
                    as_kw: true,
                    alias: { nodeName: CompositeAlias.NODE_NAME, value: tblAliasRewrite },
                };

                // Compose:
                // - WHERE <tblAliasOriginal.colRefOriginal> = <tblAliasRewrite.colRefRewrite>
                const whereClause = {
                    nodeName: BinaryExpr.NODE_NAME,
                    left: {
                        nodeName: ColumnRef1.NODE_NAME,
                        qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasOriginal },
                        value: colRefOriginal
                    },
                    operator: '=',
                    right: {
                        nodeName: ColumnRef1.NODE_NAME,
                        qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasRewrite },
                        value: colRefRewrite
                    }
                };

                // Add entry...
                pgGeneratedFromEntry = { from: fromElement, where: whereClause };
            }

            // Select the rewritten ref
            pgGeneratedFromEntry.from.expr.expr.select_list.push({
                nodeName: SelectItem.NODE_NAME,
                expr: { nodeName: ColumnRef1.NODE_NAME, value: colRefOriginal },
                alias: { nodeName: BasicAlias.NODE_NAME, value: colRefRewrite }
            });

            // Return the rewritten ref
            return {
                nodeName: ColumnRef1.NODE_NAME,
                qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasRewrite },
                value: colRefRewrite,
            };
        };

        // (1)
        // Inject the generated joins
        resultJson = {
            ...resultJson,
            join_clauses: resultJson.join_clauses?.slice(0) || []
        };

        // Rewrite original references as FROM entry references
        for (const [, { query: joinJson }] of selectorDimensions) {
            const binaryExpr = { ...joinJson.condition_clause/* OnClause */.expr };
            binaryExpr.left = createOrPatchAFromEntry(binaryExpr.left);
            resultJson.join_clauses.push(joinJson);
        }

        // (2)
        // Inject the "FROM" list generated by createOrPatchAFromEntry()
        if (pgGeneratedFromEntry) {
            resultJson = {
                ...resultJson,
                pg_from_clause: {
                    nodeName: FromClause.NODE_NAME,
                    entries: resultJson.pg_from_clause?.entries?.slice(0) || []
                }
            };
            // ...each a DerivedQuery
            resultJson.pg_from_clause.entries.push(pgGeneratedFromEntry.from);
            // The "WHERE" clause for correlation
            if (resultJson.where_clause) {
                resultJson.where_clause = {
                    nodeName: WhereClause.NODE_NAME,
                    expr: {
                        nodeName: BinaryExpr.NODE_NAME,
                        operator: 'AND',
                        left: resultJson.where_clause.expr,
                        right: pgGeneratedFromEntry.where
                    }
                };
            } else {
                resultJson.where_clause = { nodeName: WhereClause.NODE_NAME, expr: pgGeneratedFromEntry.where };
            }
        }

        return resultJson;
    }
}