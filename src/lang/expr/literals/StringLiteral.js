import { AbstractLiteral } from './AbstractLiteral.js';
import { registry } from '../../registry.js';

export class StringLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'string_literal', as: '.' }; }
    
    /* AST API */

    qualifier() { return this._get('qualifier'); }

    /* TYPESYS API */

    dataType() { return registry.DataType.fromJSON({ value: 'TEXT' }); }
}