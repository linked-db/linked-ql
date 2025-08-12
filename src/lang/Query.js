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
            'CTE',
            'CreateTableStmt',
        ];
    }

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ';' };
        return { type: this._contentTypes, as: 'entries', arity: Infinity, itemSeparator, autoSpacing: '\n' };
    }

    /* API */

    static async parse(input, options = {}) {
        const tokenStream = await this.toStream(input, options);
        const result = await super.parse(tokenStream, options);
        if (!tokenStream.done && tokenStream.current()) {
            const current = tokenStream.current();
			const message = `[${this.NODE_NAME}] Unexpected ${current.type} token:${typeof current.value === 'string' ? ` "${current.value}"` : ''} at <line ${current.line}, column ${current.column}>`;
            throw new SyntaxError(message);
        }
        return result;
    }

    stringify(options = {}) { return `${super.stringify(options)};`; }
}