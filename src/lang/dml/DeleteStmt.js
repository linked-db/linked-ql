import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { Transformer } from '../Transformer.js';
import { DMLStmt } from './DMLStmt.js';

export class DeleteStmt extends SelectorStmtMixin(DMLStmt) {

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
                            { type: 'UsingFromClause', as: 'pg_using_clause', optional: true, autoIndent: true },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
                            { type: ['PGWhereCurrentClause', 'WhereClause'], as: 'where_clause', optional: true, autoIndent: true },
                            { type: 'ReturningClause', as: 'returning_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'Identifier', as: 'my_delete_list', arity: { min: 1 }, itemSeparator },
                            { type: 'FromClause', as: 'my_from_clause', autoIndent: true },
                            { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                        ],
                    },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'keyword', value: 'FROM' },
                            { type: 'Identifier', as: 'my_delete_list', arity: { min: 1 }, itemSeparator },
                            { type: 'UsingFromClause', as: 'my_using_clause', autoIndent: true },
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

    joinClauses() { return this._get('join_clauses'); }

    whereClause() { return this._get('where_clause'); }

    returningClause() { return this._get('returning_clause'); }

    // -- Postgres

    pgUsingClause() { return this._get('pg_using_clause'); }

    // -- MySQL

    myUsingClause() { return this._get('my_using_clause'); }

    myPartitionClause() { return this._get('my_partition_clause'); }

    myDeleteList() { return this._get('my_delete_list'); }

    myFromClause() { return this._get('my_from_clause'); }

    myOrderByClause() { return this._get('my_order_by_clause'); }

    myLimitClause() { return this._get('my_limit_clause'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        if (!options.deSugar) return super.jsonfy(options, transformer, schemaInference);

        transformer = new Transformer((node, defaultTransform) => {
            return defaultTransform();
        }, transformer, this/* IMPORTANT */);

        let resultJson = super.jsonfy(options, transformer, schemaInference);

        // Order ouput JSON
        if ((options.toDialect || this.options.dialect) === 'mysql') {
            resultJson = {
                uuid: resultJson.uuid,
                nodeName: resultJson.nodeName,
                my_delete_list: resultJson.my_delete_list,
                my_from_clause: resultJson.my_from_clause,
                my_using_clause: resultJson.my_using_clause,
                join_clauses: resultJson.join_clauses,
                where_clause: resultJson.where_clause,
                // last syntax
                table_expr: resultJson.table_expr,
                my_partition_clause: resultJson.my_partition_clause,
                my_order_by_clause: resultJson.my_order_by_clause,
                my_limit_clause: resultJson.my_limit_clause,
                // Both...
                returning_clause: resultJson.returning_clause,
                result_schema: resultJson.result_schema,
            };
        } else {
            resultJson = {
                uuid: resultJson.uuid,
                nodeName: resultJson.nodeName,
                table_expr: resultJson.table_expr,
                pg_using_clause: resultJson.pg_using_clause,
                join_clauses: resultJson.join_clauses,
                where_clause: resultJson.where_clause,
                returning_clause: resultJson.returning_clause,
                result_schema: resultJson.result_schema,
            };
        }

        // 1. Finalize output JSON
		resultJson = this.finalizeOutputJSON(resultJson, transformer, schemaInference, options);
        // 2. Finalize generated JOINS
        resultJson = this.finalizeSelectorJSON(resultJson, transformer, schemaInference, options);
        
        resultJson = {
			...resultJson,
			origin_schemas: this.getOriginSchemas(transformer),
		};
        
        return resultJson;
    }
}