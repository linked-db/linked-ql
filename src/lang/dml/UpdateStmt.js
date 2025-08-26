import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { PayloadStmtMixin } from '../abstracts/PayloadStmtMixin.js';
import { DMLStmt } from './DMLStmt.js';
import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';

export class UpdateStmt extends PayloadStmtMixin/* Must be outer as can morph to a CTE */(SelectorStmtMixin(DMLStmt)) {

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

        // 1. Finalize output JSON
		resultJson = this.finalizeOutputJSON(resultJson, transformer, linkedDb, options);
        // 2. Finalize generated JOINS. Must come first
        resultJson = this.finalizeSelectorJSON(resultJson, transformer, linkedDb, options);
        // 3. Finalize entire query rewrite - returning a CTE
        resultJson = this.finalizePayloadJSON(resultJson, transformer, linkedDb, options);

        return resultJson;
    }
}