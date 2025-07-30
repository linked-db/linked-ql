import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class FKUpdateRule extends AbstractNode {
    
    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ON' },
            { type: 'keyword', value: 'UPDATE' },
            { type: 'ReferentialAction', as: 'action', assert: true },
        ];
    }

    /*. AST API */

    action() { return this._get('action'); }
}