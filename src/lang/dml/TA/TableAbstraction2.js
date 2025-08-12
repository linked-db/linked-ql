import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class TableAbstraction2 extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const optional_alias = {
            optional: true,
            syntaxes: [
                { type: 'SelectItemAlias', as: 'alias' },
                [
                    { type: 'keyword', as: 'as_kw', value: 'AS', booleanfy: true },
                    { type: 'SelectItemAlias', as: 'alias', assert: true }
                ]
            ]
        };
        return [
            { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
            { type: 'TableRef1', as: 'table_ref', assert: true },
            { type: 'operator', as: 'pg_star_ref', value: '*', booleanfy: true, optional: true, dialect: 'postgres' },
            { ...optional_alias },
        ];
    }

    /* AST API */

    tableRef() { return this._get('table_ref'); }

    alias() { return this._get('alias'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }
}