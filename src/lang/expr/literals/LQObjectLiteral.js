import { AbstractLQJsonLiteral } from './AbstractLQJsonLiteral.js';
import { registry } from '../../registry.js';
import { _eq } from '../../abstracts/util.js';

export class LQObjectLiteral extends AbstractLQJsonLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntax: [
                {
                    type: 'brace_block',
                    syntax: { type: 'LQObjectProperty', as: 'entries', arity: Infinity, itemSeparator, autoIndent: 3 },
                },
            ],
        };
    }

    static morphsTo() { return registry.CallExpr; }

    /* JSON API */

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let resultJson = super.jsonfy(options, transformer, schemaInference);
        if (options.deSugar) {

            const entries = resultJson.entries.reduce((result, propertyJson) => {
                if (propertyJson.star_ref) {
                    for (const ref of propertyJson.star_ref.result_schema) {
                        const newPropertyJson = {
                            key: { value: ref.value(), delim: ref._get('delim') },
                            value: ref.jsonfy(),
                        };
                        result = result.reduce((result, existing) => {
                            if (_eq(newPropertyJson.key.value, existing.key.value, newPropertyJson.key.delim || existing.key.delim)) {
                                return result;
                            }
                            return result.concat(existing);
                        }, []);
                        result = result.concat(newPropertyJson);
                    }
                    return result;
                }
                return result.concat(propertyJson);
            }, []);

            const resultSchemas = [];

            resultJson = {
                nodeName: registry.CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT',
                arguments: entries.reduce((args, propertyJson, i) => {

                    let resultSchema = propertyJson.value.result_schema;
                    const namespaceIdent = { ...propertyJson.key, nodeName: registry.Identifier.NODE_NAME };

                    if (resultSchema instanceof registry.ColumnSchema) {
                        resultSchema = resultSchema.clone({ renameTo: namespaceIdent });
                    } else {
                        resultSchema = registry.ColumnSchema.fromJSON({
                            name: namespaceIdent,
                            data_type: this.entries()[i].value()?.dataType().jsonfy() || { nodeName: registry.DataType.NODE_NAME, value: 'TEXT' },
                        });
                    }
                    
                    resultSchemas.push(resultSchema);

                    return args.concat(
                        { ...propertyJson.key, nodeName: registry.StringLiteral.NODE_NAME },
                        { ...propertyJson.value }
                    );

                }, []),
                result_schema: registry.JSONSchema.fromJSON({ entries: resultSchemas }, { assert: true })
            };
        }

        return resultJson;
    }
}