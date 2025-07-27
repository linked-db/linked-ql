import { AbstractLiteral } from './AbstractLiteral.js';

export class HexLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'hex_literal', as: '.' }; }
}