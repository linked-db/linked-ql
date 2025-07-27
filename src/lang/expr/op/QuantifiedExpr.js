import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class QuantifiedExpr extends AbstractNode {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'keyword', as: 'quantifier', value: ['ALL', 'ANY', 'SOME'] },
            { type: ['SubqueryConstructor', 'SetConstructor'], as: 'expr' },
        ];
    }

    /* AST API */

    quantifier() { return this._get('quantifier'); }

    expr() { return this._get('expr'); }
}