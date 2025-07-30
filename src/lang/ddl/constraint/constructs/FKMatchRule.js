import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class FKMatchRule extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'MATCH' },
            { type: 'keyword', as: 'value', value: ['FULL', 'PARTIAL', 'SIMPLE'], assert: true },
        ];
    }

    /*. AST API */

    value() { return this._get('value'); }
}