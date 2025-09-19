import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { registry } from '../registry.js';

export class DMLStmt extends AbstractNonDDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: ['InsertStmt', 'UpsertStmt', 'UpdateStmt', 'DeleteStmt'] }; }

    finalizeOutputJSON(resultJson, transformer, dbContext, options) {

        if (resultJson.returning_clause) {
            // 1. Re-resolve output list for cases of just-added deep refs in returning_clause
            // wherein schemas wouldn't have been resolvable at the time
            // 2. Finalize output list for the last time, honouring given deSugaring level with regards to star selects "*"
            // and ofcos finalize output schemas
            const returningClauseJson = this.returningClause().finalizeJSON(resultJson.returning_clause, transformer, dbContext, options);
            // Apply now
            resultJson = {
                ...resultJson,
                returning_clause: returningClauseJson,
                result_schema: returningClauseJson.result_schema,
            };
        } else {
            resultJson = {
                ...resultJson,
                result_schema: registry.JSONSchema.fromJSON({ entries: [] }, this.options),
            };
        }

        return resultJson;
    }
}
