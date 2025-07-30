import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class TableSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        const type = ['ChecKConstraint', 'TableFKConstraint', 'TablePKConstraint', 'TableUKConstraint', 'IndexSchema', 'ColumnSchema'/* must come last */];
        return [
            { type: 'TableIdent', as: 'name' },
            {
                type: 'paren_block',
                syntaxes: [
                    { type, as: 'entries', arity: Infinity, itemSeparator, dialect: 'postgres', autoIndent: true },
                    { type, as: 'entries', arity: { min: 1 }, itemSeparator, dialect: 'mysql', autoIndent: true },
                ],
                autoIndent: true
            },
        ];
    }
}