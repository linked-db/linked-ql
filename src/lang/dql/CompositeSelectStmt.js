import { SelectStmt } from './SelectStmt.js';

export class CompositeSelectStmt extends SelectStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const setTypes = ['SubqueryConstructor', 'ValuesSetConstructor', 'ParenShape', 'BasicSelectStmt', 'CallExpr'];
        return [
            { type: setTypes.concat('CompleteSelectStmt'), as: 'left' },
            { type: 'operator', as: 'operator', value: ['INTERSECT', 'UNION', 'EXCEPT'], autoSpacing: '\n' },
            { type: 'keyword', as: 'all_or_distinct', value: ['ALL', 'DISTINCT'], optional: true },
            { type: setTypes, as: 'right', assert: true, autoSpacing: '\n' },
            ...
            this._getSyntaxRulesTail(),
        ];
    }

    static get syntaxPriority() { return 100; }

    /* AST API */

    left() { return this._get('left'); }

    operator() { return this._get('operator'); }

    allOrDistinct() { return this._get('all_or_distinct'); }

    right() { return this._get('right'); }

    // --------
    
    orderByClause() { return this._get('order_by_clause'); }

    offsetClause() { return this._get('offset_clause'); }

    limitClause() { return this._get('limit_clause'); }

    forClause() { return this._get('for_clause'); }

    // -- Postgres

    pgFetchClause() { return this._get('pg_fetch_clause'); }

    // --------

    get length() { return this.left()?.selectList()?.length ?? 0; }

    [Symbol.iterator]() { return (this.left()?.selectList() || [])[Symbol.iterator](); }
}