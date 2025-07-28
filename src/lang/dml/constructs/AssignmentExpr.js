import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class AssignmentExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['LQDeepRef', 'ColumnsConstructor', 'ColumnRef'], as: 'left' },
            { type: 'operator', as: 'operator', value: '=' },
            { type: ['ValuesSetConstructor', 'Expr'], as: 'right' },
        ];
    }
}