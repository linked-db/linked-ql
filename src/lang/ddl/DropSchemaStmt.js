import { DDLStmt } from './DDLStmt.js';

export class DropSchemaStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'DROP' },
            { type: 'keyword', value: 'SCHEMA', dialect: 'postgres' },
            { type: 'keyword', value: ['SCHEMA', 'DATABASE'], dialect: 'mysql' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_exists', value: 'IF', booleanfy: true },
                    { type: 'keyword', value: 'EXISTS' },
                ]
            },
            { type: ['SchemaIdent', 'Identifier'/* to support mock names */], as: 'pg_names', arity: { min: 1 }, itemSeparator, dialect: 'postgres' },
            { type: ['SchemaIdent', 'Identifier'/* to support mock names */], as: 'my_name', dialect: 'mysql' },
            { type: 'keyword', as: 'pg_cascade_rule', value: ['CASCADE', 'RESTRICT'], optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    ifExists() { return this._get('if_exists'); }

    pgNames() { return this._get('pg_names'); }

    myName() { return this._get('my_name'); }

    pgCascadeRule() { return this._get('pg_cascade_rule'); }
}