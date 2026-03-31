import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class OptionsResetClause extends AbstractNodeList {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof OptionsResetClause) return super.fromJSON(inputJson, options, callback);
        const { nodeName, entries } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!entries) return;
        return new this({
            entries: entries.map(entry => entry?.value ?? entry),
        }, options);
    }

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                syntaxes: [
                    { type: 'keyword', value: 'RESET' },
                    { type: 'identifier', value: 'RESET', dialect: 'postgres' },
                ],
            },
            {
                type: 'paren_block',
                syntax: { type: ['keyword', 'identifier'], as: 'entries', arity: { min: 1 }, itemSeparator, autoIndent: true },
            },
        ];
    }

    stringify(options = {}) {
        const entries = this.entries().map(entry => entry?.value ?? entry);
        return `RESET (${entries.join(', ')})`;
    }
}
