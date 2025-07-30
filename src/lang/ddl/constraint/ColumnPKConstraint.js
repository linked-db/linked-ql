import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class ColumnPKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'keyword', as: '.', value: 'PRIMARY' },
            { type: 'keyword', value: 'KEY', assert: true },

        ]);
    }

    /* AST API */

    value() { return this._get('value'); }
}