import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class ConfigAssignmentExprAlt2 extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
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
                            { type: 'keyword', as: 'right' },
                            { type: 'Expr', as: 'right' },
                        ],
                    },
                ],
            }
        ];
    }
}