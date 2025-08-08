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
            { type: ['ColumnIdent', 'Identifier'/* to support mock names */], as: 'name' },
            { type: 'DataType', as: 'data_type', assert: true },
            { type, as: 'entries', arity: Infinity, singletons: true, optional: true },

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

    pkConstraint(normalized = false) {
        for (const cons of this) {
            if (cons instanceof registry.ColumnPKConstraint) return cons;
        }
        if (normalized && this.parentNode instanceof registry.TableSchema) {
            const pkConstraint = this.parentNode.pkConstraint(false);
            const pkColumns = pkConstraint?.columns() || [];
            if (pkColumns.length === 1 && pkColumns[0].identifiesAs(this.name())) {
                const { nodeName, columns, ...cJson } = pkConstraint.jsonfy();
                return registry.ColumnPKConstraint.fromJSON(cJson);
            }
        }
    }

    fkConstraint(normalized = false) {
        for (const cons of this) {
            if (cons instanceof registry.ColumnFKConstraint) return cons;
        }
        if (normalized && this.parentNode instanceof registry.TableSchema) {
            const { nodeName, columns, ...cJson } = this.parentNode.fkConstraints(false).find((c) => {
                const columns = c.columns();
                return columns.length === 1 && columns[0].identifiesAs(this.name());
            })?.jsonfy() || {};
            if (nodeName) {
                return registry.ColumnFKConstraint.fromJSON(cJson);
            }
        }
    }

    ukConstraint(normalized = false) {
        for (const cons of this) {
            if (cons instanceof registry.ColumnUKConstraint) return cons;
        }
        if (normalized && this.parentNode instanceof registry.TableSchema) {
            const { nodeName, columns, ...cJson } = this.parentNode.ukConstraints(false).find((c) => {
                const columns = c.columns();
                return columns.length === 1 && columns[0].identifiesAs(this.name());
            })?.jsonfy() || {};
            if (nodeName) {
                return registry.ColumnUKConstraint.fromJSON(cJson);
            }
        }
    }

    ckConstraint(normalized = false) {
        for (const cons of this) {
            if (cons instanceof registry.CheckConstraint) return cons;
        }
        if (normalized && this.parentNode instanceof registry.TableSchema) {
            return this.parentNode.ckConstraints(false).find((c) => {
                const columns = c.columns();
                return columns.length === 1 && columns[0].identifiesAs(this.name());
            });
        }
    }

    jsonfy({ normalized = false, ...options } = {}, linkedContext = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, linkedContext, linkedDb);
        if (normalized) {
            let tableLevelConstraints = [];
            for (const x of ['pk', 'fk', 'uk', 'ck']) {
                const method = `${x}Constraint`;
                if (!this[method]()) {
                    tableLevelConstraints.push(this[method](true)?.jsonfy());
                }
            }
            if ((tableLevelConstraints = tableLevelConstraints.filter((s) => s)).length) {
                return {
                    ...resultJson,
                    entries: resultJson.entries.concat(tableLevelConstraints)
                }
            }
        }
        return resultJson;
    }
}
