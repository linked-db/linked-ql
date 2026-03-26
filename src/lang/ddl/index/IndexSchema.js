import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class IndexSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                syntaxes: [
                    [
                        { type: 'keyword', as: 'unique_kw', value: 'UNIQUE', booleanfy: true, optional: true, dialect: 'mysql' },
                        { type: 'keyword', as: 'type_kw', value: ['INDEX', 'KEY'], dialect: 'mysql' },
                        { type: 'Identifier', as: 'name', optional: true, dialect: 'mysql' },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'entries', arity: { min: 1 }, itemSeparator, autoIndent: true, dialect: 'mysql' },
                            dialect: 'mysql',
                        },
                        { type: 'IndexUsingClause', as: 'using_clause', optional: true, dialect: 'mysql' },
                    ],
                    [
                        { type: 'IndexIdent', as: 'name', assert: true },
                        { type: 'keyword', value: 'ON' },
                        { type: ['TableIdent', 'Identifier'/* to support mock names */], as: 'table', assert: true },
                        { type: 'IndexUsingClause', as: 'using_clause', optional: true },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'entries', arity: { min: 1 }, itemSeparator, autoIndent: true },
                        },
                        { type: 'PGIndexParamInclude', as: 'pg_include_clause', optional: true, dialect: 'postgres' },
                        { type: 'PGIndexParamWith', as: 'pg_with_clause', optional: true, dialect: 'postgres' },
                    ],
                    [
                        { type: 'IndexIdent', as: 'name', assert: true },
                    ],
                ],
            },
        ];
    }

    table() { return this._get('table'); }

    usingClause() { return this._get('using_clause'); }

    entries() { return this._get('entries') || []; }

    uniqueKW() { return this._get('unique_kw'); }

    typeKW() { return this._get('type_kw'); }

    pgIncludeClause() { return this._get('pg_include_clause'); }

    pgWithClause() { return this._get('pg_with_clause'); }
}
