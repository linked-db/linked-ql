import { AbstractClassicExpr } from '../AbstractClassicExpr.js';
import { registry } from '../../registry.js';

export class TypedLiteral extends AbstractClassicExpr {

	/* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'data_type', as: 'data_type' },
            { type: 'string_literal', as: 'value' },
        ];
    }

    static get syntaxPriority() { return 50; }

    /* AST API */

    dataType() { return registry.DataType.fromJSON({ value: this._get('data_type') }); }

    value() { return this._get('value'); }
}