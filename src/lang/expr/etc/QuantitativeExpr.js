import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class QuantitativeExpr extends AbstractNode {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'keyword', as: 'quantifier', value: ['ALL', 'ANY', 'SOME'] },
            {
                syntaxes: [
                    { type: 'DerivedQuery', as: 'expr' },
                    { type: 'paren_block', syntax: { type: 'Expr', as: 'expr' } }
                ],
            }
        ];
    }

    /* AST API */

    quantifier() { return this._get('quantifier'); }

    expr() { return this._get('expr'); }
}
