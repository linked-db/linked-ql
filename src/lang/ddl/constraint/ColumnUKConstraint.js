import { ConstraintSchema } from './ConstraintSchema.js';
import { registry } from '../../registry.js';

const {
    ColumnSchema,
    ColumnNameRef,
} = registry;

export class ColumnUKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'operator', value: 'UNIQUE' },
            { type: 'keyword', as: 'my_key_kw', value: ['KEY', 'INDEX'], optional: true, dialect: 'mysql' },
            {
                optional: true,
                dialect: 'postgres',
                syntaxes: [
                    [
                        { type: 'keyword', value: 'NULLS' },
                        { type: 'operator', as: 'pg_nulls_distinct', value: 'NOT' },
                        { type: 'keyword', value: 'DISTINCT' },
                    ],
                    [
                        { type: 'keyword', value: 'NULLS' },
                        { type: 'keyword', as: 'pg_nulls_distinct', value: 'DISTINCT' },
                    ],
                ]
            },
            { type: 'PGIndexParameters', as: 'pg_index_parameters', optional: true, dialect: 'postgres' }
        ]);
    }

    /* AST API */

    myKeyKW() { return this._get('my_key_kw'); }

    pgNullsDistinct() { return this._get('pg_nulls_distinct'); }

    pgIndexParameters() { return this._get('pg_index_parameters'); }

    /* API */

    columns() {
        return this.parentNode instanceof ColumnSchema
            ? [ColumnNameRef.fromJSON({ value: this.parentNode.name().value() })]
            : [];
    }
}