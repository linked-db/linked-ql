import { AbstractNode } from '../abstracts/AbstractNode.js';

export class DataType extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                syntaxes: [
                    [
                        { type: 'data_type', as: '.', value: ['TIME', 'TIMESTAMP'], dialect: 'postgres' },
                        { type: 'data_type', as: '.', value: ['TIME', 'TIMESTAMP', 'DATETIME'], dialect: 'mysql' },
                        {
                            optional: true,
                            dialect: 'postgres',
                            syntax: [
                                { type: 'keyword', as: 'pg_with_tz', value: ['WITH', 'WITHOUT'] },
                                { type: 'keyword', value: 'TIME ZONE', assert: true },
                            ]
                        }
                    ],
                    { type: 'data_type', as: '.' },
                    { type: 'keyword', as: '.', value: ['SET'] },
                ]
            },
            {
                type: 'paren_block',
                syntax: { type: 'Expr', as: 'specificity', arity: Infinity, itemSeparator, assert: true },
                optional: true,
                optionalParens: true,
                autoSpacing: false
            },
            { type: 'AggrNotation', as: 'pg_is_aggr', autoSpacing: false, optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    value() { return this._get('value'); }

    specificity() { return this._get('specificity'); }

    // -- Postgres

    pgIsAggr() { return this._get('pg_is_aggr'); }

    pgWithTZ() { return this._get('pg_with_tz'); }
}