import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class CastExpr extends AbstractClassicExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'CAST' },
            {
                type: 'paren_block',
                syntax: [
                    { type: 'Expr', as: 'expr' },
                    { type: 'keyword', value: 'AS' },
                    { type: 'DataType', as: 'data_type', assert: true },
                ],
                assert: true,
                autoSpacing: false,
            }
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    dataType() { return this._get('data_type'); }
}