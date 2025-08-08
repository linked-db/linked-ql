import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class WindowClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'WINDOW' },
            { type: 'WindowDeclaration', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 }
        ];
    }
}