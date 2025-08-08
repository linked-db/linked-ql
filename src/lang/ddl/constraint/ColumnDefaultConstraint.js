import { ConstraintSchema } from './ConstraintSchema.js';

export class ColumnDefaultConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'DEFAULT' },
            { type: 'Expr', as: 'expr', assert: true, dialect: 'postgres' },
            { type: ['NumberLiteral', 'StringLiteral', 'NullLiteral', 'BoolLiteral', 'CallExpr', 'RowConstructor'], as: 'expr', assert: true, dialect: 'mysql' },
        ]);
    }

    /* AST API */

    expr() { return this._get('expr'); }
}