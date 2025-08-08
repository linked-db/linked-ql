import { TableAbstraction3 } from '../TA/TableAbstraction3.js';

export class JoinClause extends TableAbstraction3 {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            syntaxes: [
                [
                    { type: 'keyword', as: 'join_type', value: 'CROSS' },
                    { type: 'keyword', value: 'JOIN', assert: true },
                    ...[].concat(super.syntaxRules),
                ],
                [
                    { type: 'keyword', as: 'natural_kw', value: 'NATURAL', booleanfy: true, optional: true },
                    {
                        optional: true,
                        syntaxes: [
                            { type: 'keyword', as: 'join_type', value: 'INNER' },
                            [
                                { type: 'keyword', as: 'join_type', value: ['LEFT', 'RIGHT', 'FULL'], dialect: 'postgres' },
                                { type: 'keyword', as: 'join_type', value: ['LEFT', 'RIGHT'], dialect: 'mysql' },
                                { type: 'keyword', as: 'outer_kw', value: 'OUTER', booleanfy: true, optional: true },
                            ],
                        ],
                    },
                    { type: 'keyword', value: 'JOIN' },
                    ...[].concat(super.syntaxRules),
                    { type: ['OnClause', 'UsingClause'], as: 'condition_clause', if: '!natural_kw', assert: true, autoIndent: true },
                ],
            ],
        };
    }

    /* AST API */

    naturalKW() { return this._get('natural_kw'); }

    joinType() { return this._get('join_type'); }

    outerKW() { return this._get('outer_kw'); }

    conditionClause() { return this._get('condition_clause'); }
}