import { Identifier } from '../expr/ref/Identifier.js';

export class CompositeAlias extends Identifier {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntaxes: [
                [
                    { ...[].concat(super.syntaxRules)[0] },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator, assert: true },
                        if: 'value',
                        optional: true,
                        optionalParens: true,
                    }
                ],
                {
                    type: 'paren_block',
                    syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator, assert: true },
                },
            ],
        };
    }

    /* AST API */

    columns() { return this._get('columns'); }
}