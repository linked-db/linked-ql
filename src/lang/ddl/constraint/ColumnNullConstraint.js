import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class ColumnNullConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            {
                syntaxes: [
                    [
                        { type: 'operator', as: '.', value: 'NOT' },
                        { type: 'keyword', value: 'NULL' },
                    ],
                    { type: 'keyword', as: '.', value: 'NULL' },
                ]
            }
        ]);
    }

    /* AST API */

    value() { return this._get('value'); }
}