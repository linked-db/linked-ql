import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class SetClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'SET' },
            { type: 'AssignmentExpr', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
        ];
    }
}