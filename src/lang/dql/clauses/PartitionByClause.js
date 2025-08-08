import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class PartitionByClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'PARTITION' },
            { type: 'keyword', value: 'BY', assert: true },
            { type: 'Expr', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 }
        ];
    }
}