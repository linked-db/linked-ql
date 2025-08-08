import { AbstractLQJsonLiteral } from './AbstractLQJsonLiteral.js';
import { LQObjectSchema } from './LQObjectSchema.js';
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

    jsonfy(options = {}, linkedContext = null, linkedDb = null) {
        if (options.deSugar) {
            const result_schemas = [];

            return {
                nodeName: registry.CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAY' : 'JSON_BUILD_ARRAY',
                arguments: this.entries().map((e, i) => {

                    let result_schema = e.result_schema;
                    if (!result_schema) {
                        result_schema = registry.ColumnSchema.fromJSON({
                            name: { value: i, nodeName: registry.Identifier.NODE_NAME },
                            data_type: this.entries()[i].dataType().jsonfy(),
                        });
                    }
                    result_schemas.push(result_schema);

                    return e.jsonfy/* @case1 */(options, linkedContext, linkedDb);
                }),
                result_schema: LQObjectSchema.fromJSON({ entries: result_schemas })
            };
        }
        
        return super.jsonfy(options, linkedContext, linkedDb);
    }
}