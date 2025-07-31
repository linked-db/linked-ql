import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class MYColumnCommentModifier extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntax: [
                { type: 'keyword', value: 'COMMENT' },
                { type: 'string_literal', as: '.' },
            ],
        };
    }
}