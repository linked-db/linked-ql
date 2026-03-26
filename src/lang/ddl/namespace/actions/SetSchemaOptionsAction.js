import { AbstractNodeList } from '../../../abstracts/AbstractNodeList.js';

export class SetSchemaOptionsAction extends AbstractNodeList {

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'SET' },
            {
                type: 'paren_block',
                syntax: { type: 'ConfigAssignmentExprAlt2', as: 'entries', arity: { min: 1 }, itemSeparator, autoIndent: true },
            },
        ];
    }
}
