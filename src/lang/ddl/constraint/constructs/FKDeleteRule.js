import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class FKDeleteRule extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ON' },
            { type: 'keyword', value: 'DELETE' },
            { type: 'ReferentialAction', as: 'action', assert: true },
        ];
    }

    /*. AST API */

    action() { return this._get('action'); }
}