import { AbstractLiteral } from './AbstractLiteral.js';

export class StringLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'string_literal', as: '.' }; }
    
    /* AST API */

    qualifier() { return this._get('qualifier'); }
}