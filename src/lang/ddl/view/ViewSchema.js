import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class ViewSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: ['TableIdent', 'Identifier'/* to support mock names */], as: 'name' },
            {
                optional: true,
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator, autoIndent: true },
            },
            { type: 'keyword', value: 'AS' },
            { type: 'SelectStmt', as: 'query' },
        ];
    }

    /* AST API */

    columns() { return this._get('columns') || []; }

    query() { return this._get('query'); }
}
