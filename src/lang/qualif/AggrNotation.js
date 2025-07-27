import { AbstractNode } from '../abstracts/AbstractNode.js';

export class AggrNotation extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            type: 'bracket_block', syntax: { type: 'Expr', as: '_', arity: 0, assert: true }
        };
    }

    static get syntaxPriority() { return -1; }
}