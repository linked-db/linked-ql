import { ConstraintSchema } from '../ConstraintSchema.js';

export class PGTableEXConstraintItem extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                syntaxes: [
                    { type: 'ColumnRef2', as: 'expr' },
                    { type: 'ParenExpr', as: 'expr' },
                ],
            },
            {
                optional: true,
                syntax: [
                    { type: 'operator', value: 'COLLATE' },
                    { type: 'string_literal', as: 'collation', assert: true },
                ],
            },
            {
                optional: true,
                syntax: [
                    { type: 'Identifier', as: 'opclass' },
                    {
                        optional: true,
                        type: 'paren_block',
                        syntax: { type: 'ConfigAssignmentExpr', as: 'opclass_parameters', arity: { min: 1 }, itemSeparator, assert: true },
                    },
                ],
            },
            { type: 'keyword', value: ['ASC', 'DESC'], as: 'dir', optional: true },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', value: 'NULLS' },
                    { type: 'keyword', as: 'nulls_spec', value: ['FIRST', 'LAST'], assert: true },
                ]
            },
            { type: 'keyword', value: 'WITH' },
            { type: 'operator', as: 'operator' },
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    collation() { return this._get('collation'); }

    opclass() { return this._get('opclass'); }

    opclassParameters() { return this._get('opclass_parameters'); }

    dir() { return this._get('dir'); }

    nullsSpec() { return this._get('nulls_spec'); }

    operator() { return this._get('operator'); }
}