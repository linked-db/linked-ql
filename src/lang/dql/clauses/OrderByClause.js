import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class OrderByClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'ORDER' },
            { type: 'keyword', value: 'BY', assert: true },
            { type: 'OrderElement', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
            {
                optional: true,
                autoIndent: true,
                syntax: [
                    { type: 'keyword', as: 'with_rollup', value: 'WITH', booleanfy: true },
                    { type: 'keyword', value: 'ROLLUP', assert: true },
                ]
            },
        ];
    }

    /* AST API */

    withRollup() { return this._get('with_rollup'); }
}