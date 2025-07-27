import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class TypedLiteral extends AbstractNode {

	/* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'data_type', as: 'data_type' },
            { type: 'string_literal', as: 'value' },
        ];
    }

    static get syntaxPriority() { return 50; }

    /* AST API */

    dataType() { return Number(this._get('data_type')); }

    value() { return Number(this._get('value')); }
}