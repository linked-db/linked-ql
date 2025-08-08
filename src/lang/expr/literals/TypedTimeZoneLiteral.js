import { TypedLiteral } from './TypedLiteral.js';
import { registry } from '../../registry.js';

export class TypedTimeZoneLiteral extends TypedLiteral {

	/* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'TIME ZONE' },
            { type: 'Expr', as: 'value' },
        ];
    }
}