import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class ColumnDefaultConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'DEFAULT' },
            { type: 'Expr', as: 'expr', assert: true },
        ]);
    }

    /* AST API */

    expr() { return this._get('expr'); }
}