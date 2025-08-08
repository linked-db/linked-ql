import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class QuantitativeExpr extends AbstractNode {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'keyword', as: 'quantifier', value: ['ALL', 'ANY', 'SOME'] },
            { type: ['DerivedQuery', 'RowConstructor', 'TypedRowConstructor'], as: 'expr' },
        ];
    }

    /* AST API */

    quantifier() { return this._get('quantifier'); }

    expr() { return this._get('expr'); }
}
