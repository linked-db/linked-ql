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

    /* Custom parse */

    static async parse(input, { left = undefined, minPrecedence = 0, trail = [], ...options } = {}) {
        if (left) return;

        const tokenStream = await this.toStream(input, options);

        const result = await super.parse(tokenStream, { minPrecedence, trail, ...options });
        if (await tokenStream.match('operator', ['INTERSECT', 'UNION', 'EXCEPT'])) {
            if (this.orderByClause() || this.offsetClause() || this.limitClause() || this.forClause()) {
                const current = tokenStream.current();
                const message = `[${this.NODE_NAME}] Unexpected ${current.type} token:${typeof current.value === 'string' ? ` "${current.value}"` : ''} at <line ${current.line}, column ${current.column}>`;
                throw new SyntaxError(message);
            }
            return BasicSelectStmt.fromJSON({ ...result.jsonfy(), nodeName: undefined });
        }

        return result;
    }
}