import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class WindowFrameSpec extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'operator', value: 'AND' };
        return [
            { type: 'keyword', as: 'specifier', value: ['ROWS', 'RANGE', 'GROUPS'] },
            {
                syntaxes: [
                    [
                        { type: 'operator', as: 'with_between_clause', value: 'BETWEEN', booleanfy: true },
                        { type: 'WindowFrameBound', as: 'bounds', arity: 2, itemSeparator, assert: true },
                    ],
                    { type: 'WindowFrameBound', as: 'bounds', arity: 1, itemSeparator, assert: true },

                ]
            },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', value: 'EXCLUDE' },
                    { type: 'keyword', as: 'exclusion', value: ['CURRENT ROW', 'GROUP', 'TIES', 'NO OTHERS'], assert: true },
                ]
            },
        ];
    }

    /* AST API */

    specifier() { return this._get('specifier'); }

    withBetweenClause() { return this._get('with_between_clause'); }

    bounds() { return this._get('bounds'); }

    exclusion() { return this._get('exclusion'); }
}