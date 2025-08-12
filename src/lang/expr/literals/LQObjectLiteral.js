import { AbstractLQJsonLiteral } from './AbstractLQJsonLiteral.js';
import { registry } from '../../registry.js';
import { _eq } from '../../util.js';

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

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
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

            const result_schemas = [];

            resultJson = {
                nodeName: registry.CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT',
                arguments: entries.reduce((args, propertyJson, i) => {

                    let result_schema = propertyJson.value.result_schema;
                    const schemaIdent = { ...propertyJson.key, nodeName: registry.Identifier.NODE_NAME };

                    if (result_schema instanceof registry.ColumnSchema) {
                        result_schema = result_schema.clone({ renameTo: schemaIdent });
                    } else {
                        result_schema = registry.ColumnSchema.fromJSON({
                            name: schemaIdent,
                            data_type: this.entries()[i].value().dataType().jsonfy(),
                        });
                    }
                    result_schemas.push(result_schema);

                    return args.concat(
                        { ...propertyJson.key, nodeName: registry.StringLiteral.NODE_NAME },
                        { ...propertyJson.value }
                    );

                }, []),
                result_schema: registry.JSONSchema.fromJSON({ entries: result_schemas }, { assert: true })
            };
        }

        return resultJson;
    }
}