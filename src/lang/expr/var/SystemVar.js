import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class SystemVar extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'system_var', as: '.' }; }

    /* AST API */

    value() { return this._get('value'); }
}