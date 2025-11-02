import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class UsingFromClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'USING' },
            { type: 'FromItem', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true }
        ];
    }
}