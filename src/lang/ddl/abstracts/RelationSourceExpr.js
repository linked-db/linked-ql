import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class RelationSourceExpr extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                optional: true,
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator, autoIndent: true },
            },
            { type: 'keyword', value: 'AS' },
            { type: 'SelectStmt', as: 'expr' },
        ];
    }

    /* AST API */

    columns() { return this._get('columns'); }

    expr() { return this._get('expr'); }
}
