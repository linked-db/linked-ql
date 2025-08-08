import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class FromClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'FROM' },
            { type: 'TableAbstraction3', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true }
        ];
    }
}