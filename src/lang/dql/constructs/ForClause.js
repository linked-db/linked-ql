import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class ForClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'FOR' },
            {
                optional: true,
                dialect: 'postgres',
                syntaxes: [
                    [
                        { type: 'keyword', as: 'pg_no_key_kw', value: 'NO', booleanfy: true },
                        { type: 'keyword', value: 'KEY', if: 'pg_no_key_kw', assert: true }
                    ],
                    { type: 'keyword', as: 'pg_key_kw', value: 'KEY', booleanfy: true },
                ],
            },
            { type: 'keyword', as: 'intent_kw', value: ['UPDATE', 'SHARE'], assert: true },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', value: 'OF' },
                    { type: 'ComputedTableRef', as: 'table_names', arity: { min: 1 }, itemSeparator, assert: true }
                ],
            },
            {
                optional: true,
                syntaxes: [
                    [
                        { type: 'keyword', as: 'skip_locked_kw', value: 'SKIP', booleanfy: true },
                        { type: 'keyword', value: 'LOCKED', assert: true }
                    ],
                    { type: 'keyword', as: 'nowait_kw', value: 'NOWAIT', booleanfy: true },
                    {
                        dialect: 'mysql',
                        syntax: [
                            { type: 'keyword', as: 'my_lock_in_share_mode', value: 'LOCK', booleanfy: true },
                            { type: 'operator', value: 'IN', assert: true },
                            { type: 'keyword', value: 'SHARE', assert: true },
                            { type: 'keyword', value: 'MODE', assert: true },
                        ],
                    },
                ],
            }
        ];
    }

    /* AST API */

    intentKW() { return this._get('intent_kw'); }

    tableNames() { return this._get('table_names'); }

    skipLockedKW() { return this._get('skip_locked_kw'); }

    nowaitKW() { return this._get('nowait_kw'); }

    // -- Postgres

    pgKeyKW() { return this._get('pg_key_kw'); }

    pgNoKeyKW() { return this._get('pg_no_key_kw'); }

    // -- MySQL

    myLockInShareMode() { return this._get('my_lock_in_share_mode'); }
}