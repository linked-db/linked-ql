import { AbstractNodeList } from '../abstracts/AbstractNodeList.js';

export class MYSetStmt extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'SET' },
            { type: 'MYVarAssignmentExpr', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
        ];
    }
}