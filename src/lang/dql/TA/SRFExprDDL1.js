import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class SRFExprDDL1 extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', as: 'as_kw', value: 'AS' },
            {
                type: 'paren_block',
                syntax: { type: 'ColumnSchema', as: 'column_defs', arity: { min: 1 }, itemSeparator },
            }
        ];
    }

    /* AST API */

    asKW() { return this._get('as_kw'); }

    columnDefs() { return this._get('column_defs'); }
}