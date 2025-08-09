import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { ColumnIdentityConstraint } from './ColumnIdentityConstraint.js';

export class MYColumnAutoIncrementModifier extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntax: { type: 'keyword', as: '.', value: 'AUTO_INCREMENT' },
        };
    }

    /* JSON RULES */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        return (options.toDialect || this.options.dialect) === 'postgres'
            ? (new ColumnIdentityConstraint).jsonfy(options, transformer, linkedDb)
            : super.jsonfy(options, transformer, linkedDb);
    }
}