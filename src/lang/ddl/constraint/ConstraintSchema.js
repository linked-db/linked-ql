import { AbstractSchema } from '../../abstracts/AbstractSchema.js';
import { registry } from '../../registry.js';

const {
    ColumnSchema,
} = registry;

export class ConstraintSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static buildSyntaxRules(rules) {
        // [ DEFERRABLE | NOT DEFERRABLE ] [ INITIALLY DEFERRED | INITIALLY IMMEDIATE ]
        return [
            {
                optional: true,
                syntax: [
                    { type: 'keyword', value: 'CONSTRAINT' },
                    { type: 'Identifier', as: 'name', assert: true },
                ]
            },
            ...
            rules,
            {
                optional: true,
                dialect: 'postgres',
                syntaxes: [
                    [
                        { type: 'operator', as: 'pg_deferrable', value: 'NOT' },
                        { type: 'keyword', value: 'DEFERRABLE' },
                    ],
                    { type: 'keyword', as: 'pg_deferrable', value: 'DEFERRABLE' },
                ],
            },
            {
                optional: true,
                dialect: 'postgres',
                syntax: [
                    { type: 'keyword', value: 'INITIALLY' },
                    { type: 'keyword', as: 'pg_deferred', value: ['DEFERRED', 'IMMEDIATE'] },
                ],
            },
        ];
    }

    static get syntaxRules() {
        return {
            type: [
                // Table-only constraints must match first
                'TableFKConstraint',
                'TablePKConstraint',
                'TableUKConstraint',
                // then, non-table-only constraints
                'CheckConstraint',
                'ColumnDefaultConstraint',
                'ColumnExpressionConstraint',
                'ColumnFKConstraint',
                'ColumnIdentityConstraint',
                'ColumnNullConstraint',
                'ColumnPKConstraint',
                'ColumnUKConstraint',
                'MYAutoIncrementConstraint',
            ],
        };
    }

    get isColumnLevel() {
        return this.parentNode instanceof ColumnSchema;
    }

    /* AST API */

    pgDeferrable() { return this._get('pg_deferrable'); }

    pgDeferred() { return this._get('pg_deferred'); }
}