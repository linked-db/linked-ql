import { Identifier } from '../expr/ref/Identifier.js';

export class CTEItemAlias extends Identifier {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { ...[].concat(super.syntaxRules)[0] },
            {
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator, assert: true },
                if: 'value',
                optional: true,
                optionalParens: true,
            }
        ];
    }

    /* AST API */

    columns() { return this._get('columns'); }
}