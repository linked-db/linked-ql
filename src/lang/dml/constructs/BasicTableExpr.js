import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class BasicTableExpr extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const optional_alias = {
            optional: true,
            syntaxes: [
                { type: 'BasicAlias', as: 'alias' },
                [
                    { type: 'keyword', as: 'as_kw', value: 'AS', booleanfy: true },
                    { type: 'BasicAlias', as: 'alias', assert: true }
                ]
            ]
        };
        return [
            { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
            { type: 'TableRef', as: 'name', assert: true },
            { type: 'StarRef', as: 'pg_star_ref', optional: true, dialect: 'postgres' },
            { ...optional_alias },
        ];
    }

    /* AST API */

    name() { return this._get('name'); }

    alias() { return this._get('alias'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }
}