import { DDLStmt } from './DDLStmt.js';

export class RefreshViewStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'REFRESH' },
            {
                optional: true,
                syntaxes: [
                    { type: 'keyword', as: 'persistence', value: 'ORIGIN' },
                    { type: 'keyword', as: 'persistence', value: 'MATERIALIZED' },
                    { type: 'keyword', as: 'persistence', value: 'REALTIME' },
                ],
            },
            { type: 'keyword', value: 'VIEW' },
            { type: ['TableIdent', 'Identifier'], as: 'name' },
        ];
    }

    /* AST API */

    persistence() { return this._get('persistence'); }

    name() { return this._get('name'); }
}
