import { ResultSchemaMixin } from '../../abstracts/ResultSchemaMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';

export class SRFExpr4 extends ResultSchemaMixin(AbstractNodeList) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'ROWS' },
            { type: 'keyword', value: 'FROM' },
            {
                type: 'paren_block',
                syntax: { type: 'SRFExpr3', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
                autoIndent: true
            },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'with_ordinality', value: 'WITH', booleanfy: true },
                    { type: 'keyword', value: 'ORDINALITY', assert: true },
                ]
            }
        ];
    }

    static get syntaxPriority() { return -1; }

    /* AST API */

    withOrdinality() { return this._get('with_ordinality'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let resultJson = super.jsonfy(options, transformer, schemaInference);
        if (options.deSugar) {
            let colIdx = 1;
            const entries = resultJson.entries.reduce((entries, exprJson) => {
                const exprJsonEntries = exprJson.result_schema.jsonfy().entries.map((x) => ({ ...x, name: { ...x.name, value: colIdx++ } }));
                return entries.concat(exprJsonEntries);
            }, []);
            if (resultJson.with_ordinality) {
                entries.push({
                    name: { nodeName: registry.Identifier.NODE_NAME, value: colIdx },
                    data_type: { nodeName: registry.DataType.NODE_NAME, value: 'INT' },
                });
            }
            const resultSchema = registry.JSONSchema.fromJSON({ entries });
            resultJson = {
                ...resultJson,
                result_schema: resultSchema
            };
        }

        return resultJson;
    }
}