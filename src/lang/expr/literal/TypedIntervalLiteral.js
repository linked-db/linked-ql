import { TypedLiteral } from './TypedLiteral.js';

export class TypedIntervalLiteral extends TypedLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'data_type', as: 'data_type', value: 'INTERVAL' },
            {
                syntaxes: [
                    { type: 'string_literal', as: 'value' },
                    { type: 'number_literal', as: 'value', dialect: 'mysql' },
                ]
            },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'unit', value: ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'] },
                    {
                        optional: true,
                        syntax: [
                            { type: 'keyword', value: 'TO' },
                            { type: 'keyword', as: 'to_unit', value: ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'], assert: true },
                        ]
                    },
                ]
            },
        ];
    }

    /* AST API */

    unit() { return Number(this._get('unit')); }

    toUnit() { return Number(this._get('to_unit')); }
}