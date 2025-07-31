import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class ReferentialAction extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntaxes: [
                { type: 'keyword', as: 'value', value: ['NO ACTION', 'RESTRICT', 'CASCADE'] },
                [
                    { type: 'keyword', as: 'value', value: ['SET NULL', 'SET DEFAULT'] },
                    {
                        optional: true,
                        dialect: 'postgres',
                        type: 'paren_block',
                        syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator },
                    }
                ],
            ],
        };
    }

    /*. AST API */

    value() { return this._get('value'); }

    columns() { return this._get('columns'); }
}