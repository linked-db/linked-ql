import { DDLStmt } from './DDLStmt.js';

export class DropViewStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'DROP' },
            { type: 'keyword', value: 'VIEW' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_exists', value: 'IF', booleanfy: true },
                    { type: 'keyword', value: 'EXISTS' },
                ]
            },
            { type: ['TableIdent', 'Identifier'], as: 'names', arity: { min: 1 }, itemSeparator },
            { type: 'keyword', as: 'cascade_rule', value: ['CASCADE', 'RESTRICT'], optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    ifExists() { return this._get('if_exists'); }

    names() { return this._get('names'); }

    cascadeRule() { return this._get('cascade_rule'); }
}
