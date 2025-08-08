import { AbstractLiteral } from './AbstractLiteral.js';
import { registry } from '../../registry.js';

export class BitLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'bit_literal', as: '.' }; }

    /* TYPESYS API */

    dataType() { return registry.DataType.fromJSON({ value: 'BINARY' }); }
}