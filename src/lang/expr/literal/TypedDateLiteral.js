import { TypedLiteral } from './TypedLiteral.js';

export class TypedDateLiteral extends TypedLiteral {

	/* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'data_type', as: 'data_type', value: 'DATE' },
            { type: 'string_literal', as: 'value' },
        ];
    }
}