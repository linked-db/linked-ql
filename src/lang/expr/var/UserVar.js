import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class UserVar extends AbstractClassicExpr {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'user_var', as: '.' }; }

    /* AST API */

    value() { return this._get('value'); }
}