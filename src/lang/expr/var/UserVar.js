import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class UserVar extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'user_var', as: '.' }; }

    /* AST API */

    value() { return this._get('value'); }
}