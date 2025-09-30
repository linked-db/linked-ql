import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class AssignmentExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['LQDeepRef2', 'ColumnsConstructor', 'ColumnRef2'], as: 'left', dialect: 'postgres' },
            { type: ['LQDeepRef2', 'ColumnRef1'], as: 'left', dialect: 'mysql' },
            { type: 'operator', as: 'operator', value: '=' },
            { type: ['ValuesTableLiteral'/* For deep dimensional inserts */, 'DerivedQuery', 'Expr'], as: 'right' },
        ];
    }
}