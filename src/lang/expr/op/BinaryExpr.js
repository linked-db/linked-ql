import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class BinaryExpr extends AbstractNode {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'Expr', as: 'left', peek: [1, 'operator', ['NOT', undefined/* IMPORTANT */]] },
            { type: 'operator', as: 'negation', value: 'NOT', booleanfy: true, optional: true },
            { type: 'operator', as: 'operator' },
            { type: 'Expr', as: 'right' },
        ];
    }

    static get syntaxPriority() { return 0; }

    /* AST API */

    left() { return this._get('left'); }

    negation() { return this._get('negation'); }

    operator() { return this._get('operator'); }

    right() { return this._get('right'); }
}