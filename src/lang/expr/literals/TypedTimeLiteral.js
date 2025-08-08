import { TypedLiteral } from './TypedLiteral.js';

export class TypedTimeLiteral extends TypedLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'data_type', as: 'data_type', value: 'TIME' },
            { type: 'string_literal', as: 'value' },
            {
                optional: true,
                dialect: 'postgres',
                syntax: [
                    { type: 'keyword', as: 'pg_with_tz', value: ['WITH', 'WITHOUT'] },
                    { type: 'keyword', value: 'TIME ZONE', assert: true },
                ]
            },
        ];
    }

    /* AST API */

    pgWithTZ() { return this._get('pg_with_tz'); }
}