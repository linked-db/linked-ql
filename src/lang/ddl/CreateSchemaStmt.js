import { DDLStmt } from './DDLStmt.js';

export class CreateSchemaStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const mameRule = { type: ['SchemaIdent', 'Identifier'/* to support mock names */], as: 'name' };
        const pgAuthorizationRule = {
            syntax: [
                { type: 'keyword', value: 'AUTHORIZATION' },
                {
                    syntaxes: [
                        { type: 'keyword', as: 'pg_authorization', value: ['CURRENT_ROLE', 'CURRENT_USER', 'SESSION_USER'] },
                        { type: 'Identifier', as: 'pg_authorization' },
                    ]
                }
            ]
        };
        const pgOptionalEntiresRule = { type: ['CreateTableStmt'], as: 'pg_entries', arity: Infinity, optional: true, dialect: 'postgres' };
        return [
            { type: 'keyword', value: 'CREATE' },
            { type: 'keyword', value: 'SCHEMA', dialect: 'postgres' },
            { type: 'keyword', value: ['SCHEMA', 'DATABASE'], dialect: 'mysql' },
            {
                dialect: 'postgres',
                syntaxes: [
                    [
                        { type: 'keyword', as: 'if_not_exists', value: 'IF', booleanfy: true },
                        { type: 'operator', value: 'NOT' },
                        { type: 'keyword', value: 'EXISTS' },
                        {
                            syntaxes: [
                                [
                                    { ...mameRule },
                                    { ...pgAuthorizationRule, optional: true },
                                ],
                                { ...pgAuthorizationRule },
                            ]
                        }
                    ],
                    [
                        { ...mameRule },
                        { ...pgAuthorizationRule, optional: true },
                        { ...pgOptionalEntiresRule }
                    ],
                    [
                        { ...pgAuthorizationRule },
                        { ...pgOptionalEntiresRule }
                    ]
                ]
            },
            {
                dialect: 'mysql',
                syntax: [
                    {
                        optional: true,
                        syntax: [
                            { type: 'keyword', as: 'if_not_exists', value: 'IF', booleanfy: true },
                            { type: 'operator', value: 'NOT' },
                            { type: 'keyword', value: 'EXISTS' },
                        ]
                    },
                    { ...mameRule },
                    // TODO: mysql create options (like DEFAULT CHARACTER SET utf8)
                ]
            },
        ];
    }

    /* AST API */

    ifNotExists() { return this._get('if_not_exists'); }

    name() { return this._get('name'); }

    pgAuthorization() { return this._get('pg_authorization'); }

    pgEntries() { return this._get('pg_entries'); }
}