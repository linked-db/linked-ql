import { AbstractDDLStmt } from '../abstracts/AbstractDDLStmt.js';

export class CreateTableStmt extends AbstractDDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
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
                    { type: 'keyword', as: 'if_not_exists', value: 'IF', booleanfy: true },
                    { type: 'operator', value: 'NOT' },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            { type: 'TableSchema', as: 'argument' },
            { type: ['ConfigAssignmentExprAlt1', 'ConfigAssignmentExprAlt2'], as: 'my_create_options', arity: Infinity, dialect: 'mysql' }
        ];
    }

    /* AST API */

    temporaryKW() { return this._get('temporary_kw'); }

    ifNotExists() { return this._get('if_not_exists'); }

    argument() { return this._get('argument'); }

    myCreateOptions() { return this._get('my_create_options'); }
}