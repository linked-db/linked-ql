import { BinaryExpr } from './BinaryExpr.js';

export class BetweenExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'operator', value: 'AND' };
        return [
            { type: 'Expr', as: 'left', peek: [1, 'operator', ['NOT', 'BETWEEN']] },
            { type: 'operator', as: 'negation', value: 'NOT', booleanfy: true, optional: true },
            { type: 'operator', as: 'operator', value: 'BETWEEN' },
            { type: 'Expr', as: 'right', arity: { min: 2, max: 2, eager: false }, itemSeparator, assert: true },
        ];
    }
}