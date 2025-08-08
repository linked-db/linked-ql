import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class SystemVar extends AbstractClassicExpr {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'system_var', as: '.' }; }

    /* AST API */

    value() { return this._get('value'); }
}