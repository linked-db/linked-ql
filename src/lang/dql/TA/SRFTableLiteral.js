import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class SRFTableLiteral extends AbstractNodeList {
        
    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'ROWS' },
            { type: 'keyword', value: 'FROM' },
            {
                type: 'paren_block',
                syntax: { type: 'SRFItem', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
                autoIndent: true,
                autoSpacing: false
            }
        ];
    }
    
    static get syntaxPriority() { return -1; }
}