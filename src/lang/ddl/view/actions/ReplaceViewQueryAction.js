import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class ReplaceViewQueryAction extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            {
                optional: true,
                type: 'paren_block',
                syntax: {
                    type: 'Identifier',
                    as: 'columns',
                    arity: { min: 1 },
                    itemSeparator: { type: 'punctuation', value: ',' },
                    autoIndent: true,
                },
            },
            { type: 'keyword', value: 'AS' },
            { type: 'SelectStmt', as: 'query', assert: true },
        ];
    }

    /* AST API */

    columns() { return this._get('columns') || []; }

    query() { return this._get('query'); }
}
