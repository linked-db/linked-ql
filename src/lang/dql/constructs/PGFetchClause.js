import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGFetchClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'FETCH' },
                { type: 'keyword', as: 'rel_kw', value: ['FIRST', 'NEXT'] },
                { type: ['SubqueryConstructor', 'Expr'], as: 'expr', optional: true },
                { type: 'keyword', as: 'row_kw', value: ['ROW', 'ROWS'], assert: true },
                {
                    syntaxes: [
                        { type: 'keyword', value: 'ONLY' },
                        [
                            { type: 'keyword', as: 'with_ties', value: 'WITH' },
                            { type: 'keyword', value: 'TIES', assert: true },
                        ]
                    ]
                }
            ]
        };
    }

    /* AST API */

    relKW() { return this._get('rel_kw'); }

    expr() { return this._get('expr'); }

    rowKW() { return this._get('row_kw'); }

    withTies() { return this._get('with_ties'); }
}