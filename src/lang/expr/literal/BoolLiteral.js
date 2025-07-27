import { AbstractLiteral } from './AbstractLiteral.js';

export class BoolLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'bool_literal', as: '.' }; }
}