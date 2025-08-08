import { AbstractLiteral } from './AbstractLiteral.js';
import { registry } from '../../registry.js';

export class HexLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'hex_literal', as: '.' }; }

    /* TYPESYS API */

    dataType() { return registry.DataType.fromJSON({ value: 'BINARY' }); }
}