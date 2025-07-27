import { BinaryExpr } from './BinaryExpr.js';

export class ExtractExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'EXTRACT' },
            {
                type: 'paren_block',
                syntax: [
                    { type: 'Expr', as: 'left' },
                    { type: 'keyword', value: 'FROM' },
                    { type: 'Expr', as: 'right', assert: true },
                ],
                autoSpacing: false
            }
        ];
    }
    
    /* AST API */

    left() { return this._get('left'); }

    right() { return this._get('right'); }
}