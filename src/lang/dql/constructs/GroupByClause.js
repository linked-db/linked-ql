import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class GroupByClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'GROUP' },
            { type: 'keyword', value: 'BY', assert: true },
            { type: 'keyword', as: 'all_or_distinct', value: ['ALL', 'DISTINCT'], optional: true },
            { type: 'GroupingElement', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
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

    allOrDistinct() { return this._get('all_or_distinct'); }

    withRollup() { return this._get('with_rollup'); }
}