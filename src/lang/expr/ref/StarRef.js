import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class StarRef extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'operator', value: '*', as: '.' }; }

    static get syntaxPriority() { return -1; }

    /* AST API */

    value() { return this._get('value'); }
}