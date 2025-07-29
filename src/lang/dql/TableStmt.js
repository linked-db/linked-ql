import { AbstractStmt } from '../abstracts/AbstractStmt.js';

export class TableStmt extends AbstractStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'TABLE' },
            { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
            { type: 'TableRef', as: 'table_ref', assert: true },
            { type: 'StarRef', as: 'pg_star_ref', optional: true, dialect: 'postgres' },
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
		if (!tableRef) return new Map;
        const alias = tableRef.value();
		return new Map([[alias, tableRef]]);
	}
}