import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class CastExpr extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'CAST' },
            {
                type: 'paren_block',
                syntax: [
                    { type: 'Expr', as: 'left' },
                    { type: 'keyword', value: 'AS' },
                    { type: 'DataType', as: 'right', assert: true },
                ],
                assert: true,
                autoSpacing: false,
            }
        ];
    }

    /* AST API */

    left() { return this._get('left'); }

    right() { return this._get('right'); }
}