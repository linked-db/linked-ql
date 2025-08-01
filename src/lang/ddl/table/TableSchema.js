import { AbstractSchema } from '../../abstracts/AbstractSchema.js';
import { registry } from '../../registry.js';

export class TableSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        const type = ['TablePKConstraint', 'TableFKConstraint', 'TableUKConstraint', 'PGTableEXConstraint', 'CheckConstraint', 'ColumnSchema'/* must come last */, 'IndexSchema'];
        return [
            { type: ['TableIdent', 'Identifier'/* to support TableAbstractionRef's <TableSchema>.jsonfy({ renameTo: <Identifier> }) */], as: 'name' },
            {
                type: 'paren_block',
                syntaxes: [
                    { type, as: 'entries', arity: Infinity, itemSeparator, singletons: 'BY_KEY', dialect: 'postgres', autoIndent: true },
                    { type, as: 'entries', arity: { min: 1 }, itemSeparator, singletons: 'BY_KEY', dialect: 'mysql', autoIndent: true },
                ],
                autoIndent: true,
                autoIndentAdjust: -1,
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

    pkConstraint(smartly = false) {
        for (const entry of this) {
            if (entry instanceof registry.TablePKConstraint) return entry;
            let pk;
            if (smartly
                && entry instanceof registry.ColumnSchema
                && (pk = entry.pkConstraint())) {
                return pk;
            }
        }
    }

    fkConstraints(smartly = false) {
        const result = [];
        for (const entry of this) {
            if (entry instanceof registry.TableFKConstraint) {
                result.push(entry);
            }
            let fk;
            if (smartly
                && entry instanceof registry.ColumnSchema
                && (fk = entry.fkConstraint())) {
                result.push(pk);
            }
        }
        return result;
    }

    ukConstraint(smartly = false) {
        const result = [];
        for (const entry of this) {
            if (entry instanceof registry.TableUKConstraint) {
                result.push(entry);
            }
            let uk;
            if (smartly
                && entry instanceof registry.ColumnSchema
                && (uk = entry.ukConstraint())) {
                result.push(uk);
            }
        }
        return result;
    }

    ckConstraints(smartly = false) {
        const result = [];
        for (const entry of this) {
            if (entry instanceof registry.CheckConstraint) {
                result.push(entry);
            }
            let ck;
            if (smartly
                && entry instanceof registry.ColumnSchema
                && (ck = entry.ckConstraint())) {
                result.push(ck);
            }
        }
        return result;
    }
}