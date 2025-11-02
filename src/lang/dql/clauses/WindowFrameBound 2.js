import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class WindowFrameBound extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            syntaxes: [
                { type: 'keyword', as: 'specifier', value: 'CURRENT ROW' },
                [
                    { type: 'keyword', as: 'specifier', value: 'UNBOUNDED' },
                    { type: 'keyword', as: 'dir', value: ['PRECEDING', 'FOLLOWING'] },
                ],
                [
                    { type: 'number_literal', as: 'specifier' },
                    { type: 'keyword', as: 'dir', value: ['PRECEDING', 'FOLLOWING'] },
                ],
                [
                    { type: 'Expr'/* Ideally, Temporal types */, as: 'specifier' },
                    { type: 'keyword', as: 'dir', value: ['PRECEDING', 'FOLLOWING'] },
                ],
            ]
        };
    }

    /* AST API */

    specifier() { return this._get('specifier'); }

    dir() { return this._get('dir'); }
}