import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class PGReturningClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'RETURNING' },
                { type: 'SelectItem', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
            ],
        };
    }
}