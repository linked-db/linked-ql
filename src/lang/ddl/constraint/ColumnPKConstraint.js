import { ConstraintSchema } from './ConstraintSchema.js';
import { registry } from '../../registry.js';

export class ColumnPKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'keyword', as: '.', value: 'PRIMARY', dialect: 'postgres' },
            { type: 'keyword', as: '.', value: 'PRIMARY', optional: true, dialect: 'mysql' },
            { type: 'keyword', value: 'KEY', assert: true },
            { type: 'PGIndexParameters', as: 'pg_index_parameters', optional: true, dialect: 'postgres' },
        ]);
    }

    /* AST API */

    value() { return this._get('value'); }

    pgIndexParameters() { return this._get('pg_index_parameters'); }

    /* API */

    columns() {
        return this.parentNode instanceof registry.ColumnSchema
            ? [registry.ColumnNameRef.fromJSON({ value: this.parentNode.name().value() })]
            : [];
    }
}