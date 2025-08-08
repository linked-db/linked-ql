import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGDefaultValuesClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'DEFAULT' },
                { type: 'keyword', as: '_'/* temp fix */, value: 'VALUES' },
            ]
        };
    }
}