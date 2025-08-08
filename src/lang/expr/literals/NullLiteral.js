import { AbstractLiteral } from './AbstractLiteral.js';

export class NullLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'null_literal', as: '.' }; }
}