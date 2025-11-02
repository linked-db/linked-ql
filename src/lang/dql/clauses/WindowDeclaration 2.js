import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class WindowDeclaration extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'Identifier', as: 'name' },
            { type: 'keyword', value: 'AS' },
            { type: 'WindowSpec', as: 'spec', assert: true }
        ];
    }

    /* AST API */

    name() { return this._get('name'); }

    spec() { return this._get('spec'); }
}