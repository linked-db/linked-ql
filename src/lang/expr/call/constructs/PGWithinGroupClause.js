import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class PGWithinGroupClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'WITHIN' },
                { type: 'keyword', value: 'GROUP' },
                {
                    type: 'paren_block',
                    syntax: { type: 'OrderByClause', as: 'order_by_clause' },
                    assert: true,
                    autoIndent: true,
                },
            ]
        };
    }

    static get syntaxPriority() { return -1; }

    /* AST API */

    orderByClause() { return this._get('order_by_clause'); }
}