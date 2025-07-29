import { AbstractDDLStmt } from '../abstracts/AbstractDDLStmt.js';

export class CreateTableStmt extends AbstractDDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'CREATE' },
            {
                optional: true,
                syntaxes: [
                    { type: 'keyword', as: 'temporary_kw', value: 'TEMPORARY', booleanfy: true },
                    { type: 'keyword', as: 'temporary_kw', value: 'TEMP', booleanfy: true, dialect: 'postgres' },
                ],
            },
            { type: 'keyword', value: 'TABLE' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_not_exists', value: 'IF' },
                    { type: 'operator', value: 'NOT' },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            { type: 'TableIdent', as: 'name' },
        ];
    }

    /* AST API */

    temporaryKW() { return this._get('temporary_kw'); }

    ifNotExists() { return this._get('if_not_exists'); }

    name() { return this._get('name'); }
}