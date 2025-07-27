import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class GroupingElement extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntaxes: [
                [
                    { type: 'keyword', value: 'GROUPING SETS' },
                    {
                        type: 'paren_block', syntax:
                            { type: 'GroupingElement', as: 'grouping_sets', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
                        autoIndent: true
                    }
                ],
                [
                    { type: 'keyword', value: 'ROLLUP' },
                    { type: 'SetConstructor', as: 'rollup_set', assert: true },
                ],
                [
                    { type: 'keyword', value: 'CUBE' },
                    { type: 'SetConstructor', as: 'cube_set', assert: true },
                ],
                { type: ['Expr', 'ParenShape'], as: 'expr' },
            ]
        };
    }

    /* AST API */

    groupingSets() { return this._get('grouping_sets'); }

    rollupSet() { return this._get('rollup_set'); }

    cubeSet() { return this._get('cube_set'); }

    expr() { return this._get('expr'); }
}