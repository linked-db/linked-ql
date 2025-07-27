import { BinaryExpr } from './BinaryExpr.js';

export class DistinctFromExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'Expr', as: 'left', peek: [1, 'operator', ['IS', 'IS NOT']] },
            { type: 'operator', as: 'logic', value: ['IS', 'IS NOT'] },
            { type: 'operator', as: 'operator', value: 'DISTINCT FROM' },
            { type: 'Expr', as: 'right', assert: true },
        ];
    }

    /* AST API */

    logic() { return this._get('logic'); }
}