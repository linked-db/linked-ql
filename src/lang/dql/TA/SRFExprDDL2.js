import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class SRFExprDDL2 extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                syntaxes: [
                    { type: 'Identifier', as: 'alias', peek: [1, 'paren_block'] },
                    [
                        { type: 'keyword', as: 'as_kw', value: 'AS', peek: [2, 'paren_block'] },
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

    asKW() { return this._get('as_kw'); }

    alias() { return this._get('alias'); }

    columnDefs() { return this._get('column_defs'); }
}