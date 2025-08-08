import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class DistinctClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntaxes: [
                {
                    dialect: 'postgres',
                    syntax: [
                        { type: 'keyword', value: 'DISTINCT' },
                        { type: 'keyword', value: 'ON' },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'pg_distinct_on_list', arity: { min: 1 }, itemSeparator, assert: true }
                        },
                    ],
                },
                { type: 'keyword', as: 'all_or_distinct', value: ['ALL', 'DISTINCT'] },
            ]
        };
    }

    /* AST API */

    allOrDistinct() { return this._get('all_or_distinct'); }

    // -- Postgres

    pgDistinctOnList() { return this._get('pg_distinct_on_list'); }
}