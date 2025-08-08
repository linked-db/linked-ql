import { BinaryExpr } from './BinaryExpr.js';

export class InExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'Expr', as: 'left', peek: [1, 'operator', ['NOT', 'IN']] },
            { type: 'operator', as: 'negation', value: 'NOT', booleanfy: true, optional: true },
            { type: 'operator', as: 'operator', value: 'IN' },
            { type: ['DerivedQuery', 'RowConstructor', 'TypedRowConstructor'], as: 'right', assert: true },
        ];
    }
}