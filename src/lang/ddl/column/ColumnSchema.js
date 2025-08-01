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
            'MYColumnAutoIncrementModifier',
            'MYColumnCommentModifier',
            'MYColumnOnUpdateModifier',
            'MYColumnVisibilityModifier',
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

    pkConstraint(smartly = false) {
        for (const cons of this) {
            if (cons instanceof registry.ColumnPKConstraint) return cons;
        }
        if (smartly && this.parentNode instanceof registry.TableSchema) {
            return this.parentNode.pkConstraints().find((c) => {
                const columns = c.columns();
                return columns.length = 1 && columns[0].identifiesAs(this.name());
            });
        }
    }

    fkConstraint(smartly = false) {
        for (const cons of this) {
            if (cons instanceof registry.ColumnFKConstraint) return cons;
        }
        if (smartly && this.parentNode instanceof registry.TableSchema) {
            return this.parentNode.fkConstraints().find((c) => {
                const columns = c.columns();
                return columns.length = 1 && columns[0].identifiesAs(this.name());
            });
        }
    }

    ukConstraint(smartly = false) {
        for (const cons of this) {
            if (cons instanceof registry.ColumnUKConstraint) return cons;
        }
        if (smartly && this.parentNode instanceof registry.TableSchema) {
            return this.parentNode.ukConstraints().find((c) => {
                const columns = c.columns();
                return columns.length = 1 && columns[0].identifiesAs(this.name());
            });
        }
    }

    ckConstraint(smartly = false) {
        for (const cons of this) {
            if (cons instanceof registry.CheckConstraint) return cons;
        }
        if (smartly && this.parentNode instanceof registry.TableSchema) {
            return this.parentNode.ckConstraints().find((c) => {
                const columns = c.columns();
                return columns.length = 1 && columns[0].identifiesAs(this.name());
            });
        }
    }
}
