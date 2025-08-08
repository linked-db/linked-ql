import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class WhereClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'WHERE' },
            { type: 'Expr', as: 'expr', assert: true }
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }
}