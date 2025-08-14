import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class ColumnsConstructor extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntax: [
                {
                    type: 'paren_block',
                    syntax: { type: ['LQDeepRef2', 'ColumnRef2'], as: 'entries', arity: Infinity, itemSeparator, autoIndent: 10 },
                },
            ],
        };
    }

    static get syntaxPriority() { return -1; }
}