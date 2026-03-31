import { DDLStmt } from './DDLStmt.js';

export class RefreshViewStmt extends DDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'REFRESH' },
            {
                optional: true,
                syntaxes: [
                    { type: 'keyword', as: 'replication_mode', value: 'MATERIALIZED' },
                    { type: 'keyword', as: 'replication_mode', value: 'REALTIME' },
                ],
            },
            { type: 'keyword', value: 'VIEW' },
            { type: ['TableIdent', 'Identifier'], as: 'name' },
        ];
    }

    /* AST API */

    replicationMode() { return this._get('replication_mode'); }

    name() { return this._get('name'); }
}
