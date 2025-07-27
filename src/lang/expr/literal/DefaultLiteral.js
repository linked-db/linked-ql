import { AbstractLiteral } from './AbstractLiteral.js';

export class DefaultLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'keyword', as: '.', value: 'DEFAULT' }; }
}