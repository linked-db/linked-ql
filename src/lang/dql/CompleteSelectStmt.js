import { BasicSelectStmt } from './BasicSelectStmt.js';

export class CompleteSelectStmt extends BasicSelectStmt {

    /* SYNTAX RULES */

    static get syntaxRules() { return this.buildSyntaxRules(); }

    static get syntaxPriority() { return 99; }

    /* AST API */

    orderByClause() { return this._get('order_by_clause'); }

    offsetClause() { return this._get('offset_clause'); }

    limitClause() { return this._get('limit_clause'); }

    forClause() { return this._get('for_clause'); }

    // -- Postgres

    pgFetchClause() { return this._get('pg_fetch_clause'); }
}