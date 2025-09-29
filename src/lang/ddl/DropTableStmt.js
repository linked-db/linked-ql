import { DDLStmt } from './DDLStmt.js';

export class DropTableStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'DROP' },
            { type: 'keyword', as: 'my_temporary_kw', value: 'TEMPORARY', booleanfy: true, optional: true, dialect: 'mysql' },
            { type: 'keyword', value: 'TABLE' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_exists', value: 'IF', booleanfy: true },
                    { type: 'keyword', value: 'EXISTS' },
                ]
            },
            { type: ['TableIdent', 'Identifier'/* to support mock names */], as: 'names', arity: { min: 1 }, itemSeparator },
            { type: 'keyword', as: 'cascade_rule', value: ['CASCADE', 'RESTRICT'], optional: true },
        ];
    }

    /* AST API */

    myTemporaryKW() { return this._get('my_temporary_kw'); }

    ifExists() { return this._get('if_exists'); }

    names() { return this._get('names'); }

    cascadeRule() { return this._get('cascade_rule'); }
}