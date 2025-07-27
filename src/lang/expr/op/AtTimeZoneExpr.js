import { BinaryExpr } from './BinaryExpr.js';

export class AtTimeZoneExpr extends BinaryExpr {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'Expr', as: 'left', peek: [1, 'operator', 'AT'] },
            { type: 'operator', as: 'operator', value: 'AT' },
            {
                syntaxes: [
                    { type: 'TypedTimeZoneLiteral', as: 'right' },
                    { type: 'keyword', as: 'right', value: 'LOCAL' }
                ]
            }
        ];
    }

    static get syntaxPriority() { return 0; }

    /* AST API */

    left() { return this._get('left'); }

    right() { return this._get('right'); }
}