import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class ConfigAssignmentExprAlt2 extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', as: 'default_kw', value: 'DEFAULT', booleanfy: true, optional: true },
            {
                syntaxes: [
                    { type: 'keyword', as: 'left' },
                    { type: 'identifier', as: 'left' },
                ],
            },
            {
                optional: true,
                syntax: [
                    { type: 'operator', as: 'operator', value: '=' },
                    {
                        syntaxes: [
                            { type: 'Expr', as: 'right' },
                            { type: 'keyword', as: 'right' },
                        ],
                    },
                ],
            }
        ];
    }

    /* API */

    myDefaultKW() { return this._get('my_default_kw'); }
}