import { CallExpr } from './CallExpr.js';

export class AggrCallExpr extends CallExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };

        // Optional modifiers and clauses
        const optional_distinct_modifier = { type: 'keyword', as: 'distinct', value: 'DISTINCT', booleanfy: true, optional: true };
        const optional_separator_arg = {
            optional: true,
            syntax: [
                { type: 'keyword', value: 'SEPARATOR' },
                { type: 'Expr', as: 'separator', assert: true }
            ]
        };
        const optional_order_by_clause = { type: 'OrderByClause', as: 'order_by_clause', optional: true };
        const optional_filter_clause_postgres = { type: 'PGFilterClause', as: 'pg_filter_clause', optional: true, dialect: 'postgres' };
        const optional_within_group_clause_postgres = { type: 'PGWithinGroupClause', as: 'pg_within_group_clause', optional: true, dialect: 'postgres' };
        const optional_null_handling_directive = {
            optional: true,
            syntax: [
                { type: 'keyword', as: 'null_handling', value: ['IGNORE', 'RESPECT'] },
                { type: 'keyword', value: 'NULLS', assert: true }
            ]
        };
        const optional_over_clause = {
            optional: true,
            syntax: [
                { type: 'keyword', value: 'OVER' },
                { type: ['WindowRef', 'WindowSpec'], as: 'over_clause', assert: true }
            ]
        };

        // The syntax compositions
        return {
            peek: [0, 'keyword', [
                'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
                'ARRAY_AGG', 'STRING_AGG', 'GROUP_CONCAT',
                'REGR_SLOPE', 'COVAR_POP', 'COVAR_SAMP', 'CORR',
                'PERCENTILE_CONT', 'PERCENTILE_DISC', 'MODE',
                'RANK', 'DENSE_RANK', 'ROW_NUMBER',
                'EVERY', 'BOOL_AND', 'BOOL_OR',
                'BIT_AND', 'BIT_OR', 'BIT_XOR',
                'JSON_AGG', 'JSON_ARRAYAGG', 'JSON_OBJECT_AGG', 'JSONB_OBJECT_AGG', 'JSON_OBJECTAGG',
                'STDDEV_POP', 'STDDEV_SAMP', 'VAR_POP', 'VAR_SAMP', 'VARIANCE', 'STD',
                'XMLAGG', 'LEAD', 'LAG', 'NTILE', 'FIRST_VALUE', 'LAST_VALUE'
            ]],
            syntaxes: [

                // ---------- 🔢 Basic aggregates

                [ // COUNT(), COUNT(*)
                    { type: 'keyword', as: 'name', value: 'COUNT' },
                    {
                        type: 'paren_block',
                        syntax: [
                            { dialect: 'postgres', type: 'StarRef', as: 'arguments', arity: 1, assert: false/* note: to give syntax2 a chance */, itemSeparator },
                            { dialect: 'mysql', type: 'StarRef', as: 'arguments', arity: Infinity, assert: false/* note: to give syntax2 a chance */, itemSeparator, optional: true }
                        ],
                        autoSpacing: false,
                    },
                    { ...optional_filter_clause_postgres },
                    { ...optional_over_clause },
                ],
                [ // COUNT|SUM|AVG|MIN|MAX([DISTINCT] expr) [FILTER (...)] [OVER (...)]
                    { type: 'keyword', as: 'name', value: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] },
                    {
                        type: 'paren_block',
                        syntax: [
                            { ...optional_distinct_modifier },
                            { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true }
                        ],
                        autoSpacing: false,
                    },
                    { ...optional_filter_clause_postgres },
                    { ...optional_over_clause },
                ],

                // ---------- 🧵 List / string aggregates

                {
                    dialect: 'postgres',
                    syntax: [ // ARRAY_AGG()
                        { type: 'keyword', as: 'name', value: 'ARRAY_AGG' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: { min: 1 }, itemSeparator, assert: true },
                                { ...optional_order_by_clause },
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause },
                    ]
                },
                {
                    dialect: 'postgres',
                    syntax: [ // STRING_AGG()
                        { type: 'keyword', as: 'name', value: 'STRING_AGG' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true },
                                { ...optional_order_by_clause },
                                { ...optional_separator_arg },
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause },
                    ]
                },
                {
                    dialect: 'mysql',
                    syntax: [ // GROUP_CONCAT()
                        { type: 'keyword', as: 'name', value: 'GROUP_CONCAT' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: { min: 1 }, itemSeparator, assert: true },
                                { ...optional_order_by_clause },
                                { ...optional_separator_arg },
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_over_clause },
                    ]
                },

                // ---------- 📈 Statistical aggregates

                {
                    dialect: 'postgres',
                    syntax: [ // REGR_SLOPE() [FILTER (...)] [OVER (...)]
                        { type: 'keyword', as: 'name', value: 'REGR_SLOPE' },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true },
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause },
                    ]
                },
                [ // COVAR_POP|COVAR_SAMP|CORR() [FILTER (...)] [OVER (...)]
                    { type: 'keyword', as: 'name', value: ['COVAR_POP', 'COVAR_SAMP', 'CORR'] },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true },
                        autoSpacing: false,
                    },
                    { ...optional_filter_clause_postgres },
                    { ...optional_over_clause },
                ],

                // ---------- 📐 Ordered-set aggregates (PostgreSQL only)

                {
                    dialect: 'postgres',
                    syntax: [ // PERCENTILE_CONT|PERCENTILE_DISC(expr) [FILTER (...)] [WITHIN GROUP (...)]
                        { type: 'keyword', as: 'name', value: ['PERCENTILE_CONT', 'PERCENTILE_DISC'] },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true },
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_within_group_clause_postgres, optional: false/* OVERRIDE for "required" */ },
                    ]
                },
                {
                    dialect: 'postgres',
                    syntax: [ // MODE() [FILTER (...)] [WITHIN GROUP (...)]
                        { type: 'keyword', as: 'name', value: 'MODE' },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'arguments', arity: 0, itemSeparator, assert: true },
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_within_group_clause_postgres, optional: false/* OVERRIDE for "required" */ },
                    ]
                },
                {
                    dialect: 'postgres',
                    syntax: [ // RANK|DENSE_RANK() [FILTER (...)] [OVER (...)]
                        { type: 'keyword', as: 'name', value: ['RANK', 'DENSE_RANK'] },
                        {
                            type: 'paren_block',
                            syntax: { type: 'Expr', as: 'arguments', arity: 0, itemSeparator, assert: true },
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause, optional: false },
                    ]
                },
                [ // ROW_NUMBER() [OVER (...)]
                    { type: 'keyword', as: 'name', value: 'ROW_NUMBER' },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Expr', as: 'arguments', arity: 0, itemSeparator, assert: true },
                        autoSpacing: false,
                    },
                    { ...optional_over_clause, optional: false },
                ],

                // ---------- 🧠 Boolean aggregates

                {
                    dialect: 'postgres',
                    syntax: [ // EVERY|BOOL_AND|BOOL_OR([DISTINCT] expr) [FILTER (...)] [OVER (...)]
                        { type: 'keyword', as: 'name', value: ['EVERY', 'BOOL_AND', 'BOOL_OR'] },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true }
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause },
                    ]
                },

                // ---------- 📦 JSON aggregates

                {
                    dialect: 'postgres',
                    syntax: [ // JSON_AGG([DISTINCT] expr) [FILTER (...)] [OVER (...)]
                        { type: 'keyword', as: 'name', value: 'JSON_AGG' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: { min: 1 }, itemSeparator, assert: true }
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause },
                    ]
                },
                {
                    dialect: 'mysql',
                    syntax: [ // JSON_ARRAYAGG([DISTINCT] expr) [OVER (...)]
                        { type: 'keyword', as: 'name', value: 'JSON_ARRAYAGG' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: { min: 1 }, itemSeparator, assert: true }
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_over_clause },
                    ]
                },

                // ---------- 📦 Others 1

                {
                    dialect: 'mysql',
                    syntax: [ // BIT_XOR (MySQL only)
                        { type: 'keyword', as: 'name', value: 'BIT_XOR' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true }
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_over_clause },
                    ]
                },
                [ // BIT_AND, BIT_OR (PostgreSQL + MySQL)
                    { type: 'keyword', as: 'name', value: ['BIT_AND', 'BIT_OR'] },
                    {
                        type: 'paren_block',
                        syntax: [
                            { ...optional_distinct_modifier },
                            { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true }
                        ],
                        autoSpacing: false,
                    },
                    { ...optional_filter_clause_postgres },
                    { ...optional_over_clause },
                ],

                // ---------- 📦 Others 2

                {
                    dialect: 'postgres',
                    syntax: [
                        { type: 'keyword', as: 'name', value: ['JSON_OBJECT_AGG', 'JSONB_OBJECT_AGG'] },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true } // key, value
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause },
                    ]
                },
                {
                    dialect: 'mysql',
                    syntax: [
                        { type: 'keyword', as: 'name', value: 'JSON_OBJECTAGG' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { ...optional_distinct_modifier },
                                { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true } // key, value
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_over_clause },
                    ]
                },

                // ---------- 📦 Others 3

                [
                    { type: 'keyword', as: 'name', value: ['STDDEV_POP', 'STDDEV_SAMP', 'VAR_POP', 'VAR_SAMP', 'VARIANCE', 'STD'] },
                    {
                        type: 'paren_block',
                        syntax: [
                            { ...optional_distinct_modifier },
                            { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true }
                        ],
                        autoSpacing: false,
                    },
                    { ...optional_filter_clause_postgres },
                    { ...optional_over_clause },
                ],

                // ---------- 📦 Others 4

                {
                    dialect: 'postgres',
                    syntax: [
                        { type: 'keyword', as: 'name', value: 'XMLAGG' },
                        {
                            type: 'paren_block',
                            syntax: [
                                { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true },
                                { ...optional_order_by_clause }
                            ],
                            autoSpacing: false,
                        },
                        { ...optional_filter_clause_postgres },
                        { ...optional_over_clause },
                    ]
                },

                // ---------- 📦 Others 5

                [
                    { type: 'keyword', as: 'name', value: ['LEAD', 'LAG'] },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Expr', as: 'arguments', arity: { max: 3 }, itemSeparator, optional: true, assert: true },
                        autoSpacing: false,
                    },
                    { ...optional_null_handling_directive },
                    { ...optional_over_clause },
                ],
                [
                    { type: 'keyword', as: 'name', value: ['NTILE', 'FIRST_VALUE', 'LAST_VALUE'] },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true },
                        autoSpacing: false,
                    },
                    { ...optional_over_clause, optional: false },
                ],
            ]
        };
    }

    /* AST API */

    distinct() { return this._get('distinct'); }

    orderByClause() { return this._get('order_by_clause'); }

    separator() { return this._get('separator'); }

    overClause() { return this._get('over_clause'); }

    // -- Postgres

    pgFilterClause() { return this._get('pg_filter_clause'); }

    pgWithinGroupClause() { return this._get('pg_within_group_clause'); }
}