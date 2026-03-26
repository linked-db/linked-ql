import { DDLStmt } from './DDLStmt.js';

export class DropIndexStmt extends DDLStmt {

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'DROP' },
            { type: 'keyword', value: 'INDEX' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_exists', value: 'IF', booleanfy: true },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            {
                syntaxes: [
                    [
                        { type: ['IndexIdent', 'Identifier'], as: 'pg_names', arity: { min: 1 }, itemSeparator, dialect: 'postgres' },
                        { type: 'keyword', as: 'pg_cascade_rule', value: ['CASCADE', 'RESTRICT'], optional: true, dialect: 'postgres' },
                    ],
                    [
                        { type: ['IndexIdent', 'Identifier'], as: 'my_name', dialect: 'mysql' },
                        { type: 'keyword', value: 'ON', dialect: 'mysql' },
                        { type: ['TableIdent', 'Identifier'], as: 'my_table', assert: true, dialect: 'mysql' },
                    ],
                ],
            },
        ];
    }

    ifExists() { return this._get('if_exists'); }

    pgNames() { return this._get('pg_names'); }

    pgCascadeRule() { return this._get('pg_cascade_rule'); }

    myName() { return this._get('my_name'); }

    myTable() { return this._get('my_table'); }
}
