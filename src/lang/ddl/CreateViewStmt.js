import { DDLStmt } from './DDLStmt.js';

export class CreateViewStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'CREATE' },
            {
                optional: true,
                syntax: [
                    { type: 'operator', as: 'or_replace', value: 'OR', booleanfy: true },
                    { type: ['keyword', 'identifier'], value: 'REPLACE' },
                ],
            },
            {
                optional: true,
                syntaxes: [
                    { type: 'keyword', as: 'temporary_kw', value: 'TEMPORARY', booleanfy: true },
                    { type: 'keyword', as: 'temporary_kw', value: 'TEMP', booleanfy: true, dialect: 'postgres' },
                ],
            },
            {
                optional: true,
                syntaxes: [
                    { type: 'keyword', as: 'replication_mode', value: 'MATERIALIZED' },
                    { type: 'keyword', as: 'replication_mode', value: 'REALTIME' },
                ],
            },
            { type: 'keyword', value: 'VIEW' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_not_exists', value: 'IF', booleanfy: true },
                    { type: 'operator', value: 'NOT' },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            { type: 'ViewSchema', as: 'argument' },
            { type: 'OptionsWithClause', as: 'options_clause', optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    orReplace() { return this._get('or_replace'); }

    temporaryKW() { return this._get('temporary_kw'); }

    replicationMode() { return this._get('replication_mode'); }

    ifNotExists() { return this._get('if_not_exists'); }

    argument() { return this._get('argument'); }

    optionsClause() { return this._get('options_clause'); }
}
