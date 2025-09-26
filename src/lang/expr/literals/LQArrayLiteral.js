import { AbstractLQJsonLiteral } from './AbstractLQJsonLiteral.js';
import { registry } from '../../registry.js';

export class LQArrayLiteral extends AbstractLQJsonLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntax: [
                {
                    type: 'bracket_block',
                    syntax: { type: 'Expr', as: 'entries', arity: Infinity, itemSeparator, autoIndent: 2 },
                },
            ],
        };
    }

    static morphsTo() { return registry.CallExpr; }

    /* JSON API */

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let resultJson = super.jsonfy(options, transformer, schemaInference);
        if (options.deSugar) {
            const resultSchemas = [];

            resultJson = {
                nodeName: registry.CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAY' : 'JSON_BUILD_ARRAY',
                arguments: resultJson.entries.map((e, i) => {

                    let resultSchema = e.result_schema;
                    const schemaIdent = { value: i, nodeName: registry.Identifier.NODE_NAME };

                    if (resultSchema instanceof registry.ColumnSchema) {
                        resultSchema = resultSchema.clone({ renameTo: schemaIdent });
                    } else {
                        resultSchema = registry.ColumnSchema.fromJSON({
                            name: schemaIdent,
                            data_type: this.entries()[i].dataType().jsonfy(),
                        });
                    }
                    resultSchemas.push(resultSchema);

                    return e;
                }),
                result_schema: registry.JSONSchema.fromJSON({ entries: resultSchemas }, { assert: true })
            };
        }

        return resultJson;
    }
}