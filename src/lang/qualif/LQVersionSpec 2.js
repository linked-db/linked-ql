import { AbstractNode } from '../abstracts/AbstractNode.js';

export class LQVersionSpec extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'version_spec', as: '.' }; }

    static get syntaxPriority() { return -1; }

    /* AST API */

    value() { return this._get('value'); }
}