import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class FromElement extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        const optional_alias = {
            optional: true,
            syntaxes: [
                { type: 'CompositeAlias', as: 'alias' },
                [
                    { type: 'keyword', as: 'as_kw', value: 'AS', booleanfy: true },
                    { type: 'CompositeAlias', as: 'alias', assert: true }
                ]
            ]
        };
        const optional_table_sample_clause_postgres = {
            optional: true,
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'TABLESAMPLE' },
                {
                    syntaxes: [
                        [
                            { type: 'keyword', as: 'pg_sampling_method', value: ['BERNOULLI', 'SYSTEM'] },
                            { type: 'paren_block', syntax: { type: 'Expr', as: 'pg_sampling_arguments', arity: 1, itemSeparator, assert: true } },
                        ],
                        [
                            { type: 'identifier', as: 'pg_sampling_method' },
                            { type: 'paren_block', syntax: { type: 'Expr', as: 'pg_sampling_arguments', arity: Infinity, itemSeparator, assert: true } },
                        ],
                    ],
                    assert: true,
                },
                {
                    optional: true,
                    syntax: [
                        { type: 'keyword', value: 'REPEATABLE' },
                        { type: 'paren_block', syntax: { type: 'Expr', as: 'pg_repeatable_seed' }, assert: true },
                    ]
                }
            ]
        };
        const optional_with_ordinality_clause_postgres = {
            optional: true,
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', as: 'pg_with_ordinality', value: 'WITH', booleanfy: true },
                { type: 'keyword', value: 'ORDINALITY', assert: true },
            ]
        };

        return {
            syntaxes: [
                [
                    { type: 'keyword', as: 'lateral_kw', value: 'LATERAL', optional: true },
                    { type: 'CallExpr', as: 'expr' },
                    { ...optional_alias, optional: false },
                ],
                {
                    dialect: 'postgres',
                    syntax: [
                        { type: 'keyword', as: 'lateral_kw', value: 'LATERAL', optional: true },
                        { type: ['FunctionsSetConstructor', 'CallExpr'], as: 'expr' },
                        { ...optional_with_ordinality_clause_postgres },
                        { ...optional_alias },
                    ],
                },
                [
                    { type: 'keyword', as: 'lateral_kw', value: 'LATERAL', optional: true },
                    { type: ['SubqueryConstructor', 'ValuesSetConstructor'], as: 'expr', dialect: 'postgres' },
                    { type: 'SubqueryConstructor', as: 'expr', dialect: 'mysql' },
                    { ...optional_alias },
                ],
                [
                    { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
                    { type: 'ClassicTableRef', as: 'expr' },
                    { type: 'StarRef', as: 'pg_star_ref', optional: true, dialect: 'postgres' },
                    { ...optional_alias },
                    { ...optional_table_sample_clause_postgres },
                ],
            ],
        };
    }

    /* AST API */

    expr() { return this._get('expr'); }

    lateralKW() { return this._get('lateral_kw'); }

    asKW() { return this._get('as_kw'); }

    alias() { return this._get('alias'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }

    pgSamplingMethod() { return this._get('pg_sampling_method'); }

    pgSamplingArguments() { return this._get('pg_sampling_arguments'); }

    pgRepeatableSeed() { return this._get('pg_repeatable_seed'); }

    pgWithOrdinality() { return this._get('pg_with_ordinality'); }
}