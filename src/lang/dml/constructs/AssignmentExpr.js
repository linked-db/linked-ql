import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class AssignmentExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['LQDeepRef', 'ColumnsConstructor', 'ComputedColumnRef'], as: 'left' },
            { type: 'operator', as: 'operator', value: '=' },
            { type: ['ValuesSetConstructor', 'Expr'], as: 'right' },
        ];
    }
}