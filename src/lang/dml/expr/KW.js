import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class KW extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'keyword', as: '.' }; }

    /* AST API */

    value() { return this._get('value'); }
}