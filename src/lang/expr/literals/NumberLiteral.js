import { AbstractLiteral } from './AbstractLiteral.js';
import { registry } from '../../registry.js';

export class NumberLiteral extends AbstractLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'number_literal', as: '.' }; }

    /* TYPESYS API */

    dataType() { return registry.DataType.fromJSON({ value: 'INT' }); }
}