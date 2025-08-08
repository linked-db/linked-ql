import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class AssignmentExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['LQDeepRef1', 'ColumnsConstructor', 'ColumnRef1'], as: 'left' },
            { type: 'operator', as: 'operator', value: '=' },
            { type: ['ValuesTableLiteral', 'Expr'], as: 'right' },
        ];
    }
}