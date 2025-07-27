import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGWhereCurrentClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'WHERE' },
                { type: 'keyword', value: 'CURRENT OF' },
                { type: 'identifier', as: 'cursor_name', assert: true }
            ]
        };
    }

    /* AST API */

    cursorName() { return this._get('cursor_name'); }
}