import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class SRFExprDDL2 extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                syntaxes: [
                    { type: 'Identifier', as: 'alias' },
                    [
                        { type: 'keyword', value: 'AS', as: 'as_kw' },
                        { type: 'Identifier', as: 'alias', assert: true }
                    ]
                ]
            },
            {
                type: 'paren_block',
                syntax: { type: 'ColumnSchema', as: 'column_defs', arity: { min: 1 }, itemSeparator },
            }
        ];
    }

    /* AST API */

    alias() { return this._get('alias'); }

    columnDefs() { return this._get('column_defs'); }
}