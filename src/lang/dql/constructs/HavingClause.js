import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class HavingClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'HAVING' },
            { type: 'Expr', as: 'expr', assert: true }
        ];
    }

    static get syntaxPriority() { return -1; }

    /* AST API */

    expr() { return this._get('expr'); }
}