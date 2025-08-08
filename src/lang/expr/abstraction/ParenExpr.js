import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class ParenExpr extends AbstractClassicExpr {

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
        if (expr instanceof ParenExpr) {
            return expr.exprUnwrapped();
        }
        return expr;
    }

    /* TYPESYS */

    dataType() { return this.expr()?.dataType(); }
}