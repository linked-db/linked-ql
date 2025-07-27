import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class MYPartitionClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'mysql',
            syntax: [
                { type: 'keyword', value: 'PARTITION' },
                { type: 'Identifier', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true }
            ],
        };
    }
}