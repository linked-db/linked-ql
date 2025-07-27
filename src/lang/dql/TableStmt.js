import { AbstractStmt } from '../abstracts/AbstractStmt.js';

export class TableStmt extends AbstractStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'TABLE' },
            { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
            { type: 'ClassicTableRef', as: 'table_name', assert: true },
            { type: 'StarRef', as: 'pg_star_ref', optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    tableName() { return this._get('table_name'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }
}