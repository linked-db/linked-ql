import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class OffsetClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'OFFSET' },
            { type: 'Expr', as: 'expr', assert: true, },
            { type: 'keyword', as: 'pg_row_kw', value: ['ROW', 'ROWS'], optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    // -- Postgres

    pgRowKW() { return this._get('pg_row_kw'); }
}