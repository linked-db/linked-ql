import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class MYColumnOnUpdateModifier extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntax: [
                { type: 'keyword', value: 'ON' },
                { type: 'keyword', value: 'UPDATE' },
                { type: 'keyword', as: '.' },
            ],
        };
    }
}