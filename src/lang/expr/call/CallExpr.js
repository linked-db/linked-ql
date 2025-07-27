import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class CallExpr extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };

        return {
            syntaxes: [
                {
                    peek: [0, 'keyword', [
                        'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
                        'IF', 'NULLIF', 'IFNULL',
                        'COALESCE', 'GREATEST', 'LEAST', 'CONCAT',
                        'CONCAT_WS', 'FORMAT',
                        'MD5', 'SHA1',
                        'TO_JSON', 'TO_JSONB', 'JSON_TYPEOF', 'JSONB_TYPEOF',
                        'JSON_BUILD_ARRAY', 'JSONB_BUILD_ARRAY', 'JSON_BUILD_OBJECT', 'JSONB_BUILD_OBJECT',
                        'JSON_POPULATE_RECORD', 'JSONB_POPULATE_RECORD', 'JSON_PATH_QUERY', 'JSON_PATH_EXISTS',
                        'JSON_ARRAY', 'JSON_OBJECT', 'JSON_EXTRACT', 'JSON_UNQUOTE',
                        'JSON_SET', 'JSON_INSERT', 'JSON_REPLACE', 'JSON_REMOVE',
                        'JSON_SEARCH', 'JSON_CONTAINS', 'JSON_CONTAINS_PATH',
                        'JSON_KEYS', 'JSON_ARRAY_APPEND', 'JSON_ARRAY_INSERT',
                        'JSON_DEPTH', 'JSON_LENGTH', 'JSON_MERGE_PRESERVE',
                        'JSON_MERGE_PATCH', 'JSON_PRETTY', 'JSON_STORAGE_FREE',
                        'ST_ASTEXT', 'ST_ASGEOJSON', 'ST_GEOMFROMTEXT',
                        'ST_WITHIN', 'ST_CONTAINS', 'ST_INTERSECTS', 'ST_DISTANCE', 'ST_BUFFER',
                        'MAKE_DATE', 'MAKE_TIME', 'MAKE_TIMESTAMP', 'ARRAY',
                        'CURDATE', 'CURTIME', 'SYSDATE', 'STR_TO_DATE', 'MAKEDATE', 'MAKETIME',
                    ]],
                    syntaxes: [

                        // ---------- 🧮 Cross-dialect scalar functions (fixed arity)

                        [
                            { type: 'keyword', as: 'name', value: ['CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: 0, itemSeparator, assert: true },
                                optional: true,
                                optionalParens: true,
                                autoSpacing: false
                            }
                        ],
                        [
                            { type: 'keyword', as: 'name', value: ['NOW'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: 0, itemSeparator, assert: true },
                                optional: true,
                                autoSpacing: false
                            }
                        ],
                        [
                            { type: 'keyword', as: 'name', value: ['IF', 'NULLIF', 'IFNULL'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: { min: 2, max: 3 }, itemSeparator, assert: true },
                                autoSpacing: false
                            }
                        ],

                        // ---------- 📐 Cross-dialect scalar functions (variadic)

                        [
                            { type: 'keyword', as: 'name', value: ['COALESCE', 'GREATEST', 'LEAST', 'CONCAT'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: { min: 1 }, itemSeparator, assert: true },
                                autoSpacing: false
                            }
                        ],
                        [
                            { type: 'keyword', as: 'name', value: ['CONCAT_WS', 'FORMAT'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: { min: 2 }, itemSeparator, assert: true },
                                autoSpacing: false
                            }
                        ],
                        [
                            { type: 'keyword', as: 'name', value: ['MD5', 'SHA1'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true },
                                autoSpacing: false
                            }
                        ],

                        // ---------- 🟩 Spatial functions (PostgreSQL & MySQL)

                        [
                            { type: 'keyword', as: 'name', value: ['ST_ASTEXT', 'ST_ASGEOJSON', 'ST_GEOMFROMTEXT'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true },
                                autoSpacing: false
                            }
                        ],
                        [
                            { type: 'keyword', as: 'name', value: ['ST_WITHIN', 'ST_CONTAINS', 'ST_INTERSECTS', 'ST_DISTANCE', 'ST_BUFFER'] },
                            {
                                type: 'paren_block',
                                syntax: { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true },
                                autoSpacing: false
                            }
                        ],

                        // ---------- 🟫 PostgreSQL JSON functions

                        {
                            dialect: 'postgres',
                            syntax: [
                                { type: 'keyword', as: 'name', value: ['TO_JSON', 'TO_JSONB', 'JSON_TYPEOF', 'JSONB_TYPEOF'] },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: 1, itemSeparator, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        },
                        {
                            dialect: 'postgres',
                            syntax: [
                                { type: 'keyword', as: 'name', value: ['JSON_BUILD_ARRAY', 'JSONB_BUILD_ARRAY', 'JSON_BUILD_OBJECT', 'JSONB_BUILD_OBJECT'] },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: { min: 0 }, itemSeparator, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        },
                        {
                            dialect: 'postgres',
                            syntax: [
                                { type: 'keyword', as: 'name', value: ['JSON_POPULATE_RECORD', 'JSONB_POPULATE_RECORD', 'JSON_PATH_QUERY', 'JSON_PATH_EXISTS'] },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        },
                        {
                            dialect: 'postgres',
                            syntax: [
                                { type: 'keyword', as: 'name', value: ['ARRAY'] },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'SelectStmt', as: 'arguments', arity: 1, itemSeparator, assert: true },
                                    autoIndent: true,
                                    autoSpacing: true
                                }
                            ]
                        },

                        // ---------- 🟫 PostgreSQL Date functions

                        {
                            dialect: 'postgres',
                            syntax: [
                                { type: 'keyword', as: 'name', value: ['MAKE_DATE', 'MAKE_TIME', 'MAKE_TIMESTAMP'] },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: Infinity, itemSeparator, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        },

                        // ---------- 🟧 MySQL JSON functions

                        {
                            dialect: 'mysql',
                            syntax: [
                                {
                                    type: 'keyword', as: 'name', value: [
                                        'JSON_ARRAY', 'JSON_OBJECT', 'JSON_EXTRACT', 'JSON_UNQUOTE',
                                        'JSON_SET', 'JSON_INSERT', 'JSON_REPLACE', 'JSON_REMOVE',
                                        'JSON_SEARCH', 'JSON_CONTAINS', 'JSON_CONTAINS_PATH',
                                        'JSON_KEYS', 'JSON_ARRAY_APPEND', 'JSON_ARRAY_INSERT',
                                        'JSON_DEPTH', 'JSON_LENGTH', 'JSON_MERGE_PRESERVE',
                                        'JSON_MERGE_PATCH', 'JSON_PRETTY', 'JSON_STORAGE_FREE'
                                    ]
                                },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: { min: 1 }, itemSeparator, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        },

                        // ---------- 🟧 MySQL Date functions

                        {
                            dialect: 'mysql',
                            syntax: [
                                { type: 'keyword', as: 'name', value: ['CURDATE', 'CURTIME', 'SYSDATE'] },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: 0, itemSeparator, optional: true, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        },
                        {
                            dialect: 'mysql',
                            syntax: [
                                { type: 'keyword', as: 'name', value: 'STR_TO_DATE' },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        },
                        {
                            dialect: 'mysql',
                            syntax: [
                                { type: 'keyword', as: 'name', value: ['MAKEDATE', 'MAKETIME'] },
                                {
                                    type: 'paren_block',
                                    syntax: { type: 'Expr', as: 'arguments', arity: 2, itemSeparator, assert: true },
                                    autoSpacing: false
                                }
                            ]
                        }
                    ]
                },

                // ---------- 🧠 Fallback: general call syntax

                [
                    { type: 'keyword', as: 'name' },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Expr', as: 'arguments', arity: Infinity, itemSeparator },
                        autoSpacing: false
                    }
                ],
                [
                    { type: 'identifier', as: 'name' },
                    {
                        type: 'paren_block',
                        syntax: { type: 'Expr', as: 'arguments', arity: Infinity, itemSeparator },
                        autoSpacing: false
                    }
                ]
            ]
        };
    }

    static get syntaxPriority() { return 51; }

    /* AST API */

    name() { return this._get('name'); }

    arguments() { return this._get('arguments'); }
}
