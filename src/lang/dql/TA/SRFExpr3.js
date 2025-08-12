import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { registry } from '../../registry.js';

export class SRFExpr3 extends DDLSchemaMixin(AbstractNode) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'CallExpr', as: 'call_expr' },
            { type: 'SRFExprDDL1', as: 'qualif', optional: true },
        ];
    }

    /* AST API */

    callExpr() { return this._get('call_expr'); }

    qualif() { return this._get('qualif'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (options.deSugar) {

            let resultSchema;
            if (resultJson.qualif?.column_defs.length) {
                // a. Compose from "column_defs"
                resultSchema = registry.JSONSchema.fromJSON({
                    entries: resultJson.qualif.column_defs,
                });
            } else if (resultJson.call_expr?.result_schema) {
                // b. Compose from existing
                const givenSchema = resultJson.call_expr.result_schema;
                resultSchema = givenSchema instanceof registry.TableSchema || givenSchema instanceof registry.JSONSchema
                    ? givenSchema.clone()
                    : registry.JSONSchema.fromJSON({
                        entries: [givenSchema.jsonfy()],
                    });
            } else {
                // c. Compose from Func expr
                const schemaIdentFromFuncName = { nodeName: registry.Identifier.NODE_NAME, value: resultJson.call_expr.name };
                resultSchema = registry.JSONSchema.fromJSON({
                    entries: [{
                        nodeName: registry.ColumnSchema.NODE_NAME,
                        name: schemaIdentFromFuncName,
                        data_type: this.callExpr().dataType().jsonfy(),
                    }],
                });
            }

            resultJson = {
                ...resultJson,
                result_schema: resultSchema
            };
        }

        return resultJson;
    }
}