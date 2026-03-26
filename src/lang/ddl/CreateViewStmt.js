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
                    { type: 'keyword', as: 'persistence', value: 'ORIGIN' },
                    { type: 'keyword', as: 'persistence', value: 'MATERIALIZED' },
                    { type: 'keyword', as: 'persistence', value: 'REALTIME' },
                ],
            },
            { type: 'keyword', value: 'VIEW' },
            { type: 'ViewSchema', as: 'argument' },
        ];
    }

    /* AST API */

    orReplace() { return this._get('or_replace'); }

    persistence() { return this._get('persistence'); }

    argument() { return this._get('argument'); }
}
