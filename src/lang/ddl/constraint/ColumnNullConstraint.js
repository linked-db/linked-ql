import { ConstraintSchema } from './ConstraintSchema.js';

export class ColumnNullConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            {
                syntaxes: [
                    [
                        { type: 'operator', as: '.', value: 'NOT' },
                        { type: 'null_literal', value: 'NULL' },
                    ],
                    { type: 'null_literal', as: '.', value: 'NULL' },
                ]
            }
        ]);
    }

    /* AST API */

    value() { return this._get('value'); }
}