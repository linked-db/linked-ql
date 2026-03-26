import { DDLStmt } from './DDLStmt.js';

export class CreateIndexStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'CREATE' },
            { type: 'keyword', as: 'unique_kw', value: 'UNIQUE', booleanfy: true, optional: true },
            { type: 'keyword', value: 'INDEX' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_not_exists', value: 'IF', booleanfy: true },
                    { type: 'operator', value: 'NOT' },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            { type: 'IndexSchema', as: 'argument' },
        ];
    }

    /* AST API */

    uniqueKW() { return this._get('unique_kw'); }

    ifNotExists() { return this._get('if_not_exists'); }

    argument() { return this._get('argument'); }
}
