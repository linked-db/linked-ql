import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class TableSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'TableIdent', as: 'name' },
            {
                type: 'paren_block',
                syntaxes: [
                    { type: ['ConstraintSchema', 'IndexSchema', 'ColumnSchema'/* must come last */], as: 'entries', arity: Infinity, itemSeparator, dialect: 'postgres', autoIndent: true },
                    { type: ['ConstraintSchema', 'IndexSchema', 'ColumnSchema'/* must come last */], as: 'entries', arity: { min: 1 }, itemSeparator, dialect: 'mysql', autoIndent: true },
                ],
                autoIndent: true
            },
        ];
    }
}