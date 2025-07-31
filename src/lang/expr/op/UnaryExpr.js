import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class UnaryExpr extends AbstractNode {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'operator', as: 'operator', value: ['-', '+', 'NOT'] },
            { type: 'Expr', as: 'operand', autoSpacing: ['NOT'] },
        ];
    }

    static get syntaxPriority() { return 1;/* higher than BinaryExpr */ }

    /* AST API */

    operator() { return this._get('operator'); }

    operand() { return this._get('operand'); }
}