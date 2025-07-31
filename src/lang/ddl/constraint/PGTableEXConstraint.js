import { ConstraintSchema } from './ConstraintSchema.js';

export class PGTableEXConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'postgres',
            syntax: this.buildSyntaxRules([
                { type: 'operator', value: 'EXCLUDE' },
                {
                    optional: true,
                    syntax: [
                        { type: 'keyword', value: 'USING' },
                        { type: 'keyword', as: 'index_method', assert: true },
                    ],
                },
                {
                    type: 'paren_block',
                    syntax: { type: 'PGTableEXConstraintItem', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true },
                    assert: true,
                },
                { type: 'PGIndexParameters', as: 'pg_index_parameters', optional: true },
                {
                    optional: true,
                    syntax: [
                        { type: 'keyword', value: 'WHERE' },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'where_predicate', assert: true },
                            assert: true,
                        }
                    ],
                }
            ])
        };
    }

    /* AST API */

    indexMethod() { return this._get('index_method'); }

    entries() { return this._get('entries'); }

    pgIndexParameters() { return this._get('pg_index_parameters'); }

    wherePredicate() { return this._get('where_predicate'); }
}