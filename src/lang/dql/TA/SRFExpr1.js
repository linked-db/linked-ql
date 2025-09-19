import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { registry } from '../../registry.js';

export class SRFExpr1 extends DDLSchemaMixin(AbstractNode) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'CallExpr', as: 'call_expr' },
            { type: ['SRFExprDDL1', 'SRFExprDDL2'], as: 'qualif' },
        ];
    }

    /* AST API */

    callExpr() { return this._get('call_expr'); }

    qualif() { return this._get('qualif'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, dbContext = null) {
        let resultJson = super.jsonfy(options, transformer, dbContext);
        if (options.deSugar) {
            
            const columnDefsJson = resultJson.qualif?.column_defs || [];
            const resultSchema = resultJson.qualif?.alias
                // a. Compose from "column_defs" with explicit table alias
                ? registry.TableSchema.fromJSON({
                    name: resultJson.qualif.alias,
                    entries: columnDefsJson,
                })
                // b. Compose from "column_defs" without explicit table alias
                : registry.JSONSchema.fromJSON({
                    entries: columnDefsJson,
                });

            resultJson = {
                ...resultJson,
                result_schema: resultSchema
            };
        }

        return resultJson;
    }
}