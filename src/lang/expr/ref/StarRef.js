import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class StarRef extends AbstractClassicExpr {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'operator', value: '*', as: '.' }; }

    static get syntaxPriority() { return -1; }

    /* AST API */

    value() { return this._get('value'); }
}