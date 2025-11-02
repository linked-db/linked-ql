import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class UsingClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'USING' },
            {
                syntaxes: [
                    { type: 'Identifier', as: 'column' },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator, assert: true }
                    }
                ], assert: true
            },
        ];
    }

    /* AST API */

    column() { return this._get('column'); }

    columns() { return this._get('columns'); }
}