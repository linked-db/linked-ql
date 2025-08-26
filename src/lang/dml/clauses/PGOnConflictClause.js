import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class PGOnConflictClause extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'ON' },
                { type: 'keyword', value: 'CONFLICT' },
                {
                    syntaxes: [
                        [
                            { type: 'PGConflictTarget', as: 'conflict_target', optional: true },
                            { type: 'keyword', as: 'do_nothing', value: 'DO' },
                            { type: 'keyword', value: 'NOTHING' },
                        ],
                        [
                            { type: 'PGConflictTarget', as: 'conflict_target' },
                            { type: 'keyword', value: 'DO' },
                            { type: 'keyword', value: 'UPDATE' },
                            { type: 'keyword', value: 'SET' },
                            { type: 'AssignmentExpr', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: true },
                            { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                        ],
                    ],
                }
            ],
        };
    }

    /* AST API */

    conflictTarget() { return this._get('conflict_target'); }

    doNothing() { return this._get('do_nothing'); }

    whereClause() { return this._get('where_clause'); }
}