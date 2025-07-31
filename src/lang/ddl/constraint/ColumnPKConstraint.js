import { ConstraintSchema } from './ConstraintSchema.js';
import { registry } from '../../registry.js';

export class ColumnPKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'keyword', as: '.', value: 'PRIMARY' },
            { type: 'keyword', value: 'KEY', assert: true },
            { type: 'PGIndexParameters', as: 'pg_index_parameters', optional: true, dialect: 'postgres' },
        ]);
    }

    /* AST API */

    primaryKW() { return this._get('primary_kw'); }

    pgIndexParameters() { return this._get('pg_index_parameters'); }

    /* API */

    columns() {
        return this.parentNode instanceof registry.ColumnSchema
            ? [registry.ColumnNameRef.fromJSON({ value: this.parentNode.name().value() })]
            : [];
    }
}