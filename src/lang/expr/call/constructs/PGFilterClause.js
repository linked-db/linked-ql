import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class PGFilterClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'FILTER' },
                {
                    type: 'paren_block',
                    syntax: { type: 'WhereClause', as: 'where_clause' },
                    assert: true,
                    autoIndent: true
                }
            ]
        };
    }

    static get syntaxPriority() { return -1; }

    /* AST API */

    whereClause() { return this._get('where_clause'); }
}