import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class SetConstructor extends AbstractNodeList {
        
    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntax: [
                {
                    type: 'paren_block',
                    syntax: { type: 'Expr', as: 'entries', arity: Infinity, itemSeparator, autoIndent: 2 },
                    autoIndent: true,
                    autoIndentAdjust: -1,
                },
            ],
        };
    }

    static get syntaxPriority() { return 49; } // Below all () shapes like SubqueryConstructor and LQBackRefConstructor
}