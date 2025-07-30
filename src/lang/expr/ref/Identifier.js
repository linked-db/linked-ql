import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class Identifier extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'identifier', as: '.' }; }

    static get syntaxPriority() { return -1; }

    /* AST API */

    value() { return this._get('value'); }

    /* API */

    identifiesAs(value, ci = false) {
        if (typeof value === 'string') {
            return this._eq(this._get('value'), value, ci);
        }
        return super.identifiesAs(value, ci);
    }
}