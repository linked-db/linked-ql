import { DerivedQuery } from '../../dql/TA/DerivedQuery.js';
import { registry } from '../../registry.js';

export class ScalarSubquery extends DerivedQuery {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            type: 'paren_block',
            syntax: { type: ['SelectStmt', 'CTE'], as: 'expr' },
            autoIndent: true,
        };
    }

    static get syntaxPriority() { return 48; } // Below RowConstructor

    /* TYPESYS API */

    dataType() {
        if (this.resultSchema()) {
            return this.resultSchema().dataType();
        }
        return registry.DataType.fromJSON({ value: 'TEXT' });
    }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (options.deSugar) {
            let result_schema = resultJson.expr?.result_schema;
            if (result_schema?.length !== 1) {
                throw new Error(`Scalar subqueries must return a scalar value.`);
            }
            result_schema = result_schema.entries()[0];
            resultJson = {
                ...resultJson,
                result_schema,
            };
        }
        return resultJson;
    }
}