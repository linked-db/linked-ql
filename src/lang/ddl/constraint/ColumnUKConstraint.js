import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class ColumnUKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'operator', value: 'UNIQUE' },
            { type: 'keyword', as: '.', value: ['KEY', 'INDEX'], optional: true, dialect: 'mysql' },
            {
                optional: true,
                syntaxes: [
                    [
                        { type: 'keyword', value: 'NULLS' },
                        { type: 'operator', as: 'nulls_distinct', value: 'NOT' },
                        { type: 'keyword', value: 'DISTINCT' },
                    ],
                    [
                        { type: 'keyword', value: 'NULLS' },
                        { type: 'keyword', as: 'nulls_distinct', value: 'DISTINCT' },
                    ],
                ]
            }
        ]);
    }

    /* AST API */

    value() { return this._get('value'); }

    nullsDistinct() { return this._get('nulls_distinct'); }
}