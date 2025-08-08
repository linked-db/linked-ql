import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class MYVarAssignmentExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntax: [
                { type: ['UserVar', 'SystemVar'], as: 'left' },
                { type: 'operator', as: 'operator', value: ['=', ':='] },
                { type: 'Expr', as: 'right' },
            ],
        };
    }
}