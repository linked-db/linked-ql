import { AbstractLiteral } from './AbstractLiteral.js';

export class UnknownLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'unknown_literal', as: '.' }; }
 }