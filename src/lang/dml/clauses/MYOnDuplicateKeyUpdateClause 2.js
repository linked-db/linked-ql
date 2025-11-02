import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class MYOnDuplicateKeyUpdateClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'mysql',
            syntax: [
                { type: 'keyword', value: 'ON' },
                { type: 'keyword', value: 'DUPLICATE' },
                { type: 'keyword', value: 'KEY' },
                { type: 'keyword', value: 'UPDATE' },
                { type: 'AssignmentExpr', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: true },
            ]
        };
    }
}