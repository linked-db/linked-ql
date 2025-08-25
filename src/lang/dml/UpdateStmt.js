import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { PayloadStmtMixin } from '../abstracts/PayloadStmtMixin.js';
import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';
import { _eq } from '../util.js';

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
                            { type: 'SetClause', as: 'set_clause', autoSpacing: '\n' },
                            { type: 'FromClause', as: 'pg_from_clause', optional: true, dialect: 'postgres', autoSpacing: '\n' },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoSpacing: '\n' },
                            { type: ['PGWhereCurrentClause', 'WhereClause'], as: 'where_clause', optional: true, autoSpacing: '\n' },
                            { type: 'ReturningClause', as: 'returning_clause', optional: true, autoSpacing: '\n' },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'TableAbstraction2', as: 'table_expr' },
                            { type: 'SetClause', as: 'set_clause', autoSpacing: '\n' },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoSpacing: '\n' },
                            { type: 'OrderByClause', as: 'my_order_by_clause', optional: true, autoSpacing: '\n' },
                            { type: 'LimitClause', as: 'my_limit_clause', optional: true, autoSpacing: '\n' },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'TableAbstraction1', as: 'my_update_list', arity: { min: 1 }, itemSeparator },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoSpacing: '\n' },
                            { type: 'SetClause', as: 'set_clause', autoSpacing: '\n' },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoSpacing: '\n' },
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

    returningClause() { return this._get('returning_clause'); }

    // MySQL

    myUpdateList() { return this._get('my_update_list'); }

    myOrderByClause() { return this._get('my_order_by_clause'); }

    myLimitClause() { return this._get('my_limit_clause'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (!options.deSugar) return super.jsonfy(options, transformer, linkedDb);

        transformer = new Transformer((node, defaultTransform) => {
            return defaultTransform();
        }, transformer, this/* IMPORTANT */);

        let resultJson = super.jsonfy(options, transformer, linkedDb);

        // Order ouput JSON
        if ((options.toDialect || this.options.dialect) === 'mysql') {
            resultJson = {
                uuid: resultJson.uuid,
                nodeName: resultJson.nodeName,
                table_expr: resultJson.table_expr,
                my_update_list: resultJson.my_update_list,
                join_clauses: resultJson.join_clauses,
                set_clause: resultJson.set_clause,
                where_clause: resultJson.where_clause,
                my_order_by_clause: resultJson.my_order_by_clause,
                my_limit_clause: resultJson.my_limit_clause,
            };
        } else {
            resultJson = {
                uuid: resultJson.uuid,
                nodeName: resultJson.nodeName,
                table_expr: resultJson.table_expr,
                set_clause: resultJson.set_clause,
                pg_from_clause: resultJson.pg_from_clause,
                join_clauses: resultJson.join_clauses,
                where_clause: resultJson.where_clause,
                returning_clause: resultJson.returning_clause,
                result_schema: resultJson.result_schema,
            };
        }

        if (!resultJson.set_clause?.entries.length) {
            // All assignments were BackRefs and have been offloaded
            const pkConstraint = resultJson.table_expr.result_schema.pkConstraint(true);
            const pkColumn = pkConstraint.columns()[0];
            resultJson = {
                ...resultJson,
                set_clause: {
                    ...resultJson.set_clause,
                    entries: [{
                        nodeName: registry.AssignmentExpr.NODE_NAME,
                        left: pkColumn.jsonfy(),
                        operator: '=',
                        right: pkColumn.jsonfy({ toKind: 1 })
                    }],
                },
            };
        }

        // 1. Finalize generated JOINS. Must come first
        resultJson = this.finalizeSelectorJSON(resultJson, transformer, linkedDb, options);
        // 2. Finalize entire query rewrite - returning a CTE
        resultJson = this.finalizePayloadJSON(resultJson, transformer, linkedDb, options);

        return resultJson;
    }

    finalizeSelectorJSON(resultJson, transformer, linkedDb, options) {
        if (this.options.dialect !== 'postgres') {
            // Redirect finalization to the standard finalization logic
            return super.finalizeSelectorJSON(resultJson, transformer, linkedDb, options);
        }

        if (resultJson.where_clause?.cursor_name) {
            throw new Error(`Deep/Back Refs are currently not supported with a "WHERE CURRENT OF..." statement`);
        }

        const {
            DerivedQuery,
            CompleteSelectStmt,
            SelectList,
            SelectItem,
            FromItemAlias,
            FromClause,
            WhereClause,
            JoinClause,
            TableRef1,
            BinaryExpr,
            FromItem,
        } = registry;

        const rand = transformer.rand('join');

        const selectorDimensions = transformer.statementContext.artifacts.get('selectorDimensions');

        // Each table involved in a Deep/BackRef should have a corresponding entry
        // in the "FROM" list where we have the chance to establish our JOIN
        // with a corresponding extra "WHERE" clause that correlates the generated table with the original table

        const tableExpr = resultJson.table_expr;

        const tblAliasOriginal = tableExpr.alias.value;
        const tblAliasOriginal_delim = tableExpr.alias.delim;
        const tblAliasRewrite = `${rand}:${tblAliasOriginal}`;

        const pkConstraint = tableExpr.result_schema.pkConstraint(true);
        const pkColumnRef = pkConstraint?.columns()[0].jsonfy({ toKind: 1 });

        let pgGeneratedFromItem;

        const createCorrelationExpr = (columnRef) => {
            return {
                nodeName: BinaryExpr.NODE_NAME,
                left: {
                    ...columnRef, qualifier: {
                        nodeName: TableRef1.NODE_NAME,
                        value: tblAliasOriginal,
                        delim: tblAliasOriginal_delim
                    },
                },
                operator: '=',
                right: {
                    ...columnRef, qualifier: {
                        nodeName: TableRef1.NODE_NAME,
                        value: tblAliasRewrite
                    },
                },
            };
        };

        let selectItems;
        const createOrPatchAFromEntry = (columnRef) => {
            if (!_eq(columnRef.qualifier.value, tblAliasOriginal, columnRef.qualifier.delim || tblAliasOriginal_delim)) {
                return columnRef;
            }

            if (!pgGeneratedFromItem) {
                // Compose:
                // - ( SELECT [] FROM <tblRefOriginal> )
                // - AS <tblAliasRewrite>
                const fromItem = {
                    nodeName: FromItem.NODE_NAME,
                    expr: {
                        nodeName: DerivedQuery.NODE_NAME,
                        expr: {
                            // SELECT <...>
                            nodeName: CompleteSelectStmt.NODE_NAME,
                            select_list: { nodeName: SelectList.NODE_NAME, entries: [] },
                            from_clause: {
                                // FROM <tblRefOriginal>
                                nodeName: FromClause.NODE_NAME,
                                entries: [{
                                    nodeName: FromItem.NODE_NAME,
                                    expr: tableExpr.table_ref,
                                    alias: { nodeName: FromItemAlias.NODE_NAME, as_kw: true, value: tblAliasRewrite }
                                }]
                            },
                        },
                    },
                    // AS <tblAliasRewrite>
                    alias: { nodeName: FromItemAlias.NODE_NAME, as_kw: true, value: tblAliasRewrite },
                };

                selectItems = fromItem.expr.expr.select_list.entries;

                // Compose:
                // - WHERE <tblAliasOriginal.colRefOriginal> = <tblAliasRewrite.colRefRewrite>
                if (pkColumnRef) {
                    fromItem.expr.expr.select_list.entries.push({
                        nodeName: SelectItem.NODE_NAME,
                        expr: { ...pkColumnRef, qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasRewrite }, },
                    });
                    fromItem.expr.expr.where_clause = {
                        nodeName: WhereClause.NODE_NAME,
                        expr: createCorrelationExpr(pkColumnRef),
                    };
                }
                // Add entry...
                pgGeneratedFromItem = fromItem;
            }

            // 1. Select the rewritten ref
            if (!selectItems.find((fieldJson) => _eq(fieldJson.expr.value, columnRef.value, fieldJson.expr.delim || columnRef.delim))) {
                selectItems.push({
                    nodeName: SelectItem.NODE_NAME,
                    expr: { ...columnRef, qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasRewrite }, }
                });
            }

            // 2. Use ewritten ref for correlation in the absence of a primary key
            if (!pkColumnRef) {
                let whereExpr = createCorrelationExpr(columnRef);
                if (pgGeneratedFromItem.expr.expr.where_clause) {
                    whereExpr = {
                        nodeName: BinaryExpr.NODE_NAME,
                        left: pgGeneratedFromItem.expr.expr.where_clause.expr,
                        operator: 'AND',
                        right: whereExpr
                    };
                }
                pgGeneratedFromItem.expr.expr.where_clause = {
                    nodeName: WhereClause.NODE_NAME,
                    expr: whereExpr,
                };
            }

            return {
                ...columnRef,
                qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasRewrite },
            };
        };

        // (1)
        // Rewrite original references to FROM entry references
        const rewrittenJoinEntries = [];
        for (const [, { query: joinJson }] of selectorDimensions) {
            rewrittenJoinEntries.push({
                ...joinJson,
                condition_clause: {
                    ...joinJson.condition_clause,
                    expr: {
                        ...joinJson.condition_clause.expr,
                        left: createOrPatchAFromEntry(joinJson.condition_clause.expr.left)
                    },
                },
            });
        }

        // (2)
        // Inject the "FROM" list generated by createOrPatchAFromEntry()
        if (pgGeneratedFromItem) {
            resultJson = {
                ...resultJson,
                pg_from_clause: {
                    nodeName: FromClause.NODE_NAME,
                    entries: (resultJson.pg_from_clause?.entries || []).concat(
                        FromItem.fromJSON(pgGeneratedFromItem, this.options).jsonfy(options, transformer, linkedDb)
                    ),
                },
            };
        }

        // (3)
        // Inject the generated joins
        for (const joinJson of rewrittenJoinEntries) {
            resultJson = {
                ...resultJson,
                join_clauses: (resultJson.join_clauses || []).concat(
                    JoinClause.fromJSON(joinJson, this.options).jsonfy(options, transformer, linkedDb)
                ),
            };
        }

        return resultJson;
    }
}