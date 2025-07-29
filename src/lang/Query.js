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

    static async parse(input, options = {}) {
        const tokenStream = await this.toStream(input, options);
        const result = await super.parse(tokenStream, options);
        if (!tokenStream.done && tokenStream.current()) {
            const current = tokenStream.current();
			const message = `[${this.NODE_NAME}] Unexpected token:${typeof current.value === 'string' ? ` "${current.value}" (${current.type})` : ''} at <line ${current.line}, column ${current.column}>`;
            throw new Error(message);
        }
        return result;
    }

    stringify(options = {}) { return `${super.stringify(options)};`; }

    /* SCHEMA API */
    
	_capture(requestName, requestSource) {
		const result = super._capture(requestName, requestSource);
		if (requestName === 'CONTEXT.ROOT_SCHEMA' && !result) {
			return new Set;
		}
		return result;
	}
}