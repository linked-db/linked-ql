import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { ResultSchemaMixin } from '../../abstracts/ResultSchemaMixin.js';
import { registry } from '../../registry.js';

export class SRFExpr2 extends ResultSchemaMixin(AbstractNode) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'CallExpr', as: 'call_expr' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'with_ordinality', value: 'WITH', booleanfy: true },
                    { type: 'keyword', value: 'ORDINALITY', assert: true },
                ]
            },
        ];
    }

    /* AST API */

    callExpr() { return this._get('call_expr'); }

    withOrdinality() { return this._get('with_ordinality'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, dbContext = null) {
        let resultJson = super.jsonfy(options, transformer, dbContext);
        if (options.deSugar) {

            let resultSchema;

            let ordinalityColumn;
            if (resultJson.with_ordinality) {
                ordinalityColumn = registry.ColumnSchema.fromJSON({
                    name: { nodeName: registry.Identifier.NODE_NAME, value: 'ordinality' },
                    data_type: { nodeName: registry.DataType.NODE_NAME, value: 'INT' },
                });
            }

            const schemaIdentFromFuncName = { nodeName: registry.Identifier.NODE_NAME, value: resultJson.call_expr.name };

            if (resultJson.call_expr?.result_schema) {
                // a. Compose from existing
                resultSchema = resultJson.call_expr.result_schema;

                if (resultSchema instanceof registry.TableSchema
                    || resultSchema instanceof registry.JSONSchema) {

                    if (ordinalityColumn) {
                        const resultSchema_json = resultSchema.jsonfy();
                        resultSchema = resultSchema.constructor.fromJSON({
                            name: schemaIdentFromFuncName,
                            ...resultSchema_json, // overridingly
                            entries: [
                                ...resultSchema_json.entries, 
                                ordinalityColumn
                            ],
                        });
                    } else {
                        resultSchema = resultSchema.clone();
                    }

                } else {
                    resultSchema = registry.JSONSchema.fromJSON({
                        entries: [
                            resultSchema.jsonfy()
                        ].concat(ordinalityColumn || []),
                    });
                }
            } else {
                // b. Compose from Func expr
                resultSchema = registry.JSONSchema.fromJSON({
                    entries: [{
                        nodeName: registry.ColumnSchema.NODE_NAME,
                        name: schemaIdentFromFuncName,
                        data_type: this.callExpr().dataType().jsonfy(),
                    }].concat(ordinalityColumn || []),
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