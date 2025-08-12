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
            const resultSchemas = [];

            return {
                nodeName: registry.CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAY' : 'JSON_BUILD_ARRAY',
                arguments: this.entries().map((e, i) => {

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

                    return e.jsonfy/* @case1 */(options, transformer, linkedDb);
                }),
                result_schema: registry.JSONSchema.fromJSON({ entries: resultSchemas }, { assert: true })
            };
        }

        return super.jsonfy(options, transformer, linkedDb);
    }
}