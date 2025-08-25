import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGDefaultValuesClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', as: '.', value: 'DEFAULT' },
                { type: 'keyword', value: 'VALUES' },
            ]
        };
    }
}