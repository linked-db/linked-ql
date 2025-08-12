import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { ParenExpr } from '../../expr/abstraction/ParenExpr.js';

export class DerivedQuery extends DDLSchemaMixin(ParenExpr) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            type: 'paren_block',
            syntax: { type: ['SelectStmt', 'InsertStmt', 'UpsertStmt', 'UpdateStmt', 'DeleteStmt', 'CTE'], as: 'expr' },
            autoIndent: true,
        };
    }

    static get syntaxPriority() { return -1; }

    /* TYPESYS API */

    dataType() { return this.expr()?.dataType(); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (options.deSugar) {
            const resultSchema = resultJson.expr?.result_schema;
            if (!resultSchema?.length) {
                throw new Error(`Derived queries must return a result set.`);
            }
            resultJson = {
                ...resultJson,
                result_schema: resultSchema,
            };
        }
        return resultJson;
    }
}