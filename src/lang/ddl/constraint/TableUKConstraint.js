import { ConstraintSchema } from './ConstraintSchema.js';

export class TableUKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'UNIQUE' },
            { type: 'keyword', as: 'my_key_kw', value: ['KEY', 'INDEX'], optional: true, dialect: 'mysql' },
            {
                optional: true,
                dialect: 'postgres',
                syntaxes: [
                    [
                        { type: 'keyword', value: 'NULLS' },
                        { type: 'operator', as: 'pg_nulls_distinct', value: 'NOT' },
                        { type: 'keyword', value: 'DISTINCT', assert: true },
                    ],
                    [
                        { type: 'keyword', value: 'NULLS' },
                        { type: 'keyword', as: 'pg_nulls_distinct', value: 'DISTINCT', assert: true },
                    ],
                ]
            },
            {
                type: 'paren_block',
                syntax: { type: 'ColumnRef2', as: 'columns', arity: { min: 1 }, itemSeparator, singletons: 'BY_KEY', assert: true },
                assert: true,
            },
            { type: 'PGIndexParameters', as: 'pg_index_parameters', optional: true, dialect: 'postgres' }
        ]);
    }

    /* AST API */

    myKeyKW() { return this._get('my_key_kw'); }

    pgNullsDistinct() { return this._get('pg_nulls_distinct'); }

    columns() { return this._get('columns'); }

    pgIndexParameters() { return this._get('pg_index_parameters'); }
}