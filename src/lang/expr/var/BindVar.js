import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class BindVar extends AbstractClassicExpr {

	/* SYNTAX RULES */

    static get syntaxRules() { return { type: 'bind_var', as: '.' }; }

    /* AST API */

    value() { return this._get('value'); }
}