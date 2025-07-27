import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class ParenShape extends AbstractNode {   
        
    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            type: 'paren_block',
            syntax: { type: 'Expr', as: 'expr' },
            autoIndent: true,
        };
    }

    static get syntaxPriority() { return -1; }

    /* AST API */

    expr() { return this._get('expr'); }

    exprUnwrapped() {
        const expr = this._get('expr');
        if (expr instanceof ParenShape) {
            return expr.exprUnwrapped();
        }
        return expr;
    }
}