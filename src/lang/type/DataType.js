import { AbstractNode } from '../abstracts/AbstractNode.js';

export class DataType extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                syntaxes: [
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
}