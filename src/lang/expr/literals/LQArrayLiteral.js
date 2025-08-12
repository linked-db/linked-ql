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

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (options.deSugar) {
            const result_schemas = [];

            return {
                nodeName: registry.CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAY' : 'JSON_BUILD_ARRAY',
                arguments: this.entries().map((e, i) => {

                    let result_schema = e.result_schema;
                    const schemaIdent = { value: i, nodeName: registry.Identifier.NODE_NAME };

                    if (result_schema instanceof registry.ColumnSchema) {
                        result_schema = result_schema.clone({ renameTo: schemaIdent });
                    } else {
                        result_schema = registry.ColumnSchema.fromJSON({
                            name: schemaIdent,
                            data_type: this.entries()[i].dataType().jsonfy(),
                        });
                    }
                    result_schemas.push(result_schema);

                    return e.jsonfy/* @case1 */(options, transformer, linkedDb);
                }),
                result_schema: registry.JSONSchema.fromJSON({ entries: result_schemas }, { assert: true })
            };
        }

        return super.jsonfy(options, transformer, linkedDb);
    }
}