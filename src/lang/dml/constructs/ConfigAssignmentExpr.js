import { BinaryExpr } from '../../expr/op/BinaryExpr.js';

export class ConfigAssignmentExpr extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', as: 'my_default_kw', value: 'DEFAULT', booleanfy: true, dialect: 'mysql', optional: true },
            {
                syntaxes: [
                    { type: 'keyword', as: 'left' },
                    { type: 'identifier', as: 'left' },
                ],
            },
            { type: 'operator', as: 'operator', value: '=' },
            {
                syntaxes: [
                    { type: 'Expr', as: 'right' },
                    { type: 'keyword', as: 'right' },
                ],
            }
        ];
    }

    /* API */

    myDefaultKW() { return this._get('my_default_kw'); }
}