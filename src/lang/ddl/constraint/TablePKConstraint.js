import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class TablePKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'PRIMARY' },
            { type: 'keyword', value: 'KEY', assert: true },
            {
                type: 'paren_block',
                syntax: { type: 'ColumnNameRef', as: 'columns', arity: { min: 1 }, itemSeparator, assert: true },
                assert: true,
                autoIndex: true,
            }
        ]);
    }

    /* AST API */

    columns() { return this._get('columns'); }
}