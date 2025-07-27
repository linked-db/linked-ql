import { AbstractNodeList } from './abstracts/AbstractNodeList.js';

export class Query extends AbstractNodeList {

    /* SYNTAX RULES */

    static get _contentTypes() {
        return [
            'SelectStmt',
            'TableStmt',
            'InsertStmt',
            'UpsertStmt',
            'UpdateStmt',
            'DeleteStmt',
            'MYSetStmt',
            'CTE'
        ];
    }

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ';' };
        return { type: this._contentTypes, as: 'entries', arity: Infinity, itemSeparator, autoSpacing: '\n' };
    }

    /* API */

    stringify(options = {}) { return `${super.stringify(options)};`; }
}