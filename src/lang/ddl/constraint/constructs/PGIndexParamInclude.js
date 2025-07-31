import { AbstractNodeList } from '../../../abstracts/AbstractNodeList.js';

export class PGIndexParamInclude extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'INCLUDE' },
            {
                type: 'paren_block',
                syntax: { type: 'ColumnNameRef', as: 'entries', arity: { min: 1 }, itemSeparator },
            }
        ];
    }
}