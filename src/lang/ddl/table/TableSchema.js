import { AbstractSchema } from '../../abstracts/AbstractSchema.js';
import { Transformer } from '../../Transformer.js';
import { registry } from '../../registry.js';

export class TableSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        const type = ['TablePKConstraint', 'TableFKConstraint', 'TableUKConstraint', 'PGTableEXConstraint', 'CheckConstraint', 'ColumnSchema'/* must come last */, 'IndexSchema'];
        return [
            { type: ['TableIdent', 'Identifier'/* to support mock names */], as: 'name' },
            {
                type: 'paren_block',
                syntaxes: [
                    { type, as: 'entries', arity: Infinity, itemSeparator, singletons: 'BY_KEY', optional: true, dialect: 'postgres', autoIndent: true },
                    { type, as: 'entries', arity: { min: 1 }, itemSeparator, singletons: 'BY_KEY', dialect: 'mysql', autoIndent: true },
                ],
            },
        ];
    }

    /* API */

    columns() {
        const result = [];
        for (const entry of this) {
            if (!(entry instanceof registry.ColumnSchema)) continue;
            result.push(entry);
        }
        return result;
    }

    pkConstraint(normalized = false) {
        for (const entry of this) {
            if (entry instanceof registry.TablePKConstraint) return entry;
            let pk;
            if (normalized
                && entry instanceof registry.ColumnSchema
                && (pk = entry.pkConstraint())) {
                const instance = registry.TablePKConstraint.fromJSON({
                    ...pk.jsonfy(),
                    nodeName: undefined,
                    columns: [registry.ColumnRef2.fromJSON({ value: entry.name().value() })]
                });
                this._adoptNodes(instance);
                return instance;
            }
        }
    }

    fkConstraints(normalized = false) {
        const result = [];
        for (const entry of this) {
            if (entry instanceof registry.TableFKConstraint) {
                result.push(entry);
            }
            let fk;
            if (normalized
                && entry instanceof registry.ColumnSchema
                && (fk = entry.fkConstraint())) {
                const instance = registry.TableFKConstraint.fromJSON({
                    ...fk.jsonfy(),
                    nodeName: undefined,
                    columns: [registry.ColumnRef2.fromJSON({ value: entry.name().value() })]
                });
                this._adoptNodes(instance);
                result.push(instance);
            }
        }
        return result;
    }

    ukConstraints(normalized = false) {
        const result = [];
        for (const entry of this) {
            if (entry instanceof registry.TableUKConstraint) {
                result.push(entry);
            }
            let uk;
            if (normalized
                && entry instanceof registry.ColumnSchema
                && (uk = entry.ukConstraint())) {
                const instance = registry.TableUKConstraint.fromJSON({
                    ...uk.jsonfy(),
                    nodeName: undefined,
                    columns: [registry.ColumnRef2.fromJSON({ value: entry.name().value() })]
                });
                this._adoptNodes(instance);
                result.push(instance);
            }
        }
        return result;
    }

    ckConstraints(normalized = false) {
        const result = [];
        for (const entry of this) {
            if (entry instanceof registry.CheckConstraint) {
                result.push(entry);
            }
            let ck;
            if (normalized
                && entry instanceof registry.ColumnSchema
                && (ck = entry.ckConstraint()?.clone())) {
                this._adoptNodes(ck);
                result.push(ck);
            }
        }
        return result;
    }

    jsonfy({ normalized = false, ...options } = {}, transformer = null, linkedDb = null) {
        const columnLockedConstraints = [];

        const consMap = {
            [registry.ColumnPKConstraint.NODE_NAME]: registry.TablePKConstraint.NODE_NAME,
            [registry.ColumnFKConstraint.NODE_NAME]: registry.TableFKConstraint.NODE_NAME,
            [registry.ColumnUKConstraint.NODE_NAME]: registry.TableUKConstraint.NODE_NAME,
            [registry.CheckConstraint.NODE_NAME]: registry.CheckConstraint.NODE_NAME,
        };

        if (normalized) {
            transformer = new Transformer((node, defaultTransform) => {
                if (node?.NODE_NAME in consMap && node.parentNode instanceof registry.ColumnSchema) {
                    columnLockedConstraints.push({
                        ...node.jsonfy(),
                        nodeName: consMap[node.NODE_NAME],
                        ...(!(node instanceof registry.CheckConstraint) ? { columns: [registry.ColumnRef2.fromJSON({ value: node.parentNode.name().value() })] } : {})
                    });
                    return; // Exclude from original column
                }
                return defaultTransform();
            }, transformer);
        }

        let resultJson = super.jsonfy(options, transformer, linkedDb);

        if (normalized) {
            resultJson = {
                ...resultJson,
                entries: resultJson.entries.concat(columnLockedConstraints)
            }
        }

        return resultJson;
    }
}