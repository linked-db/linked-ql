import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';

export class SRFExpr4 extends DDLSchemaMixin(AbstractNodeList) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'ROWS' },
            { type: 'keyword', value: 'FROM' },
            {
                type: 'paren_block',
                syntax: { type: 'SRFExpr3', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
                autoIndent: true,
                autoSpacing: false
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

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (options.deSugar) {

            let ordinalityColumn;
            if (resultJson.with_ordinality) {
                ordinalityColumn = registry.ColumnSchema.fromJSON({
                    name: { nodeName: registry.Identifier.NODE_NAME, value: 'ordinality' },
                    data_type: { nodeName: registry.DataType.NODE_NAME, value: 'INT' },
                });
            }

            const result_schema = registry.JSONSchema.fromJSON({
                entries: [
                    ...resultJson.entries.reduce((entries, exprJson) => {
                        const exprJsonEntries = exprJson.result_schema.jsonfy().entries;
                        return entries.concat(exprJsonEntries);
                    }, []),
                ].concat(ordinalityColumn || []),
            });

            resultJson = {
                ...resultJson,
                result_schema
            }
        }

        return resultJson;
    }
}