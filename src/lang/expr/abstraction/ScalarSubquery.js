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

    jsonfy(options = {}, transformer = null, dbContext = null) {
        let resultJson = super.jsonfy(options, transformer, dbContext);
        if (options.deSugar) {
            let resultSchema = resultJson.expr?.result_schema;
            if (resultSchema?.length !== 1) {
                throw new Error(`Scalar subqueries must return a scalar value.`);
            }
            resultSchema = resultSchema.entries()[0];
            resultJson = {
                ...resultJson,
                result_schema: resultSchema,
            };
        }
        return resultJson;
    }
}