import { AbstractLiteral } from './AbstractLiteral.js';

export class NumberLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'number_literal', as: '.' }; }
}