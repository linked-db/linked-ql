import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class LimitClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'LIMIT' },
            {
                dialect: 'mysql',
                syntax: [
                    {
                        optional: true,
                        syntax: [
                            { type: 'Expr', as: 'my_offset' },
                            { type: 'punctuation', value: ',', autoSpacing: false },
                        ]
                    },
                    { type: 'Expr', as: 'expr', assert: true, },
                ]
            },
            {
                dialect: 'postgres',
                syntaxes: [
                    { type: 'keyword', as: 'pg_all_kw', value: 'ALL' },
                    { type: 'Expr', as: 'expr', assert: true, },
                ],
            },
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    // -- Postgres

    pgAllKW() { return this._get('pg_all_kw'); }

    // -- MySQL

    myOffset() { return this._get('my_offset'); }
}