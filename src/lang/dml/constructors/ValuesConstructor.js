import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class ValuesConstructor extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntaxes: [
                [
                    { type: 'keyword', value: 'VALUES' },
                    { type: 'RowConstructor', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true }
                ],
                {
                    dialect: 'mysql',
                    syntax: [
                        { type: 'keyword', value: ['VALUES', 'VALUE'] },
                        { type: 'RowConstructor', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true }
                    ]
                },
            ],
        };
    }

    static get syntaxPriority() { return -1; }
}