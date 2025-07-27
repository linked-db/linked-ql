import { AbstractLiteral } from './AbstractLiteral.js';

export class BitLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'bit_literal', as: '.' }; }
}