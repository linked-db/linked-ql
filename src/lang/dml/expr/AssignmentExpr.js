import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class AssignmentExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['LQDeepRef1', 'ColumnsConstructor', 'ColumnRef2'], as: 'left', dialect: 'postgres' },
            { type: ['LQDeepRef1', 'ColumnRef1'], as: 'left', dialect: 'mysql' },
            { type: 'operator', as: 'operator', value: '=' },
            { type: ['ValuesTableLiteral', 'Expr'], as: 'right' },
        ];
    }
}