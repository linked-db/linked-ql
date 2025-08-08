import { BinaryExpr } from './BinaryExpr.js';

export class PGCastExpr2 extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'Expr', as: 'left', peek: [1, 'operator', '::'] },
                { type: 'operator', as: 'operator', value: '::', autoSpacing: false },
                { type: 'DataType', as: 'right', assert: true, autoSpacing: false },
            ]
        };
    }

    /* TYPESYS API */

    expr() { return this.left(); }

    dataType() { return this.right(); }
}