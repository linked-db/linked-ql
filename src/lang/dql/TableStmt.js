import { AbstractStmt } from '../abstracts/AbstractStmt.js';

export class TableStmt extends AbstractStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'TABLE' },
            { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
            { type: 'TableRef2', as: 'table_ref', assert: true },
            { type: 'operator', as: 'pg_star_ref', value: '*', booleanfy: true, optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    tableRef() { return this._get('table_ref'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }

    /* SCHEMA API */

    querySchemas() {
        const tableRef = this.tableRef();

        const alias = registry.Identifier.fromJSON({ value: tableRef.value() });
        const tableSchema = tableRef.resultSchema(transformer).clone({ renameTo: alias });
        
        return new Set([tableSchema]);
    }
}