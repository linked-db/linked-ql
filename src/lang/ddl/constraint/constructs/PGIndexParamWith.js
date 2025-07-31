import { AbstractNodeList } from '../../../abstracts/AbstractNodeList.js';

export class PGIndexParamWith extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'WITH' },
            {
                type: 'paren_block',
                syntax: { type: 'ConfigAssignmentExprAlt2', as: 'entries', arity: { min: 1 }, itemSeparator },
            }
        ];
    }
}