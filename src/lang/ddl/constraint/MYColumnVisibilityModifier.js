import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class MYColumnVisibilityModifier extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntaxes: [
                { type: 'keyword', as: '.', value: 'VISIBLE' },
                { type: 'keyword', as: '.', value: 'INVISIBLE' },
            ],
        };
    }
}