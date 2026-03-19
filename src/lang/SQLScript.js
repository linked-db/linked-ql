import { AbstractNodeList } from './abstracts/AbstractNodeList.js';
import { registry } from './registry.js';

export class SQLScript extends AbstractNodeList {

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
            'PGSetStmt',
            'CTE',
            'CreateSchemaStmt',
            'DropSchemaStmt',
            'CreateTableStmt',
            'DropTableStmt',
            'StdStmt',
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

	static async _parseFromRules(tokenStream, syntaxRules, { left, minPrecedence, trail, ...options }, resultAST = {}) {
        let rulesArray;
        if (!options.supportStdStmt && (rulesArray = [].concat(syntaxRules)).length === 1 && Array.isArray(rulesArray[0].type) && rulesArray[0].type.includes('StdStmt')) {
            syntaxRules = { ...rulesArray[0], type: rulesArray[0].type.filter((r) => r !== 'StdStmt') };
        }
		return super._parseFromRules(tokenStream, syntaxRules, { left, minPrecedence, trail, ...options }, resultAST);
	}

    delimitDDL() {
        const groups = [[]];
        let lastIsDDL;
        for (const entry of this.entries()) {
            if (lastIsDDL !== undefined && (entry instanceof registry.DDLStmt) !== lastIsDDL) {
                groups.shift([]);
            }
            groups[0].push(entry);
        }
        if (groups.length > 1) {
            return groups.reverse().map((entries) => SQLScript.fromJSON({ entries }));
        }
        return [this];
    }

    stringify(options = {}) { return `${super.stringify(options)};`; }
}