import { AbstractSchema } from '../../abstracts/AbstractSchema.js';
import { registry } from '../../registry.js';

export class ColumnSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const type = [
            'CheckConstraint',
            'ColumnDefaultConstraint',
            'ColumnExpressionConstraint',
            'ColumnFKConstraint',
            'ColumnIdentityConstraint',
            'ColumnNullConstraint',
            'ColumnPKConstraint',
            'ColumnUKConstraint',
            'MYAutoIncrementConstraint',
        ];
        return [
            { type: 'ColumnIdent', as: 'name' },
            { type: 'DataType', as: 'data_type', assert: true },
            { type, as: 'entries', arity: Infinity, singletons: true },

        ];
    }

    /* AST API */

    dataType() { return this._get('data_type'); }

    /* API */

    defaultConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.ColumnDefaultConstraint) return cons;
        }
    }

    expressionConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.ColumnExpressionConstraint) return cons;
        }
    }

    identityConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.ColumnIdentityConstraint) return cons;
        }
    }

    nullConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.ColumnNullConstraint) return cons;
        }
    }

    pkConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.ColumnPKConstraint) return cons;
        }
    }

    fkConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.ColumnFKConstraint) return cons;
        }
    }

    ukConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.ColumnUKConstraint) return cons;
        }
    }

    ckConstraint() {
        for (const cons of this) {
            if (cons instanceof registry.CheckConstraint) return cons;
        }
    }
}
