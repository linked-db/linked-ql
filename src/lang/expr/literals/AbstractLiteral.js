import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class AbstractLiteral extends AbstractClassicExpr {

    /* SYNTAX RULES */

    static get syntaxPriority() { return 49; }
    
    /* AST API */

    value() { return this._get('value'); }
}