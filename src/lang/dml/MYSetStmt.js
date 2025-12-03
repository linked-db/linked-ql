import { AbstractNodeList } from '../abstracts/AbstractNodeList.js';

export class MYSetStmt extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'mysql',
            syntax: [
                { type: 'keyword', value: 'SET' },
                { type: 'MYVarAssignmentExpr', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
            ]
        };
    }

    /** API */

    jsonfy({ deSugar, ...options } = {}, transformer = null, schemaInference = null) {
        return super.jsonfy(options, transformer, schemaInference);
    }
}