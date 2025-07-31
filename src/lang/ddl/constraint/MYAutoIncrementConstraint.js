import { ConstraintSchema } from './ConstraintSchema.js';
import { ColumnIdentityConstraint } from './ColumnIdentityConstraint.js';

export class MYAutoIncrementConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntax: { type: 'keyword', as: '.', value: 'AUTO_INCREMENT' },
        };
    }

    /* JSON RULES */

    jsonfy(options = {}, transformCallback = null, linkedDb = null) {
        return (options.toDialect || this.options.dialect) === 'postgres' 
            ? (new ColumnIdentityConstraint).jsonfy(options = {}, transformCallback, linkedDb)
            : super.jsonfy(options = {}, transformCallback, linkedDb);
    }
}