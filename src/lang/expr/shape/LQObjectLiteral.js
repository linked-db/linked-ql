import { AbstractLQShapeLiteral } from './abstracts/AbstractLQShapeLiteral.js';
import { registry } from '../../registry.js';

export class LQObjectLiteral extends AbstractLQShapeLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntax: [
                {
                    type: 'brace_block',
                    syntax: { type: 'LQObjectProperty', as: 'entries', arity: Infinity, itemSeparator, autoIndent: 2 },
                },
            ],
        };
    }

    static morphsTo() { return registry.CallExpr; }

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformCallback, linkedDb);
        if (options.deSugar) {
            resultJson = {
                nodeName: registry.CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT',
                arguments: resultJson.entries.reduce((args, propertyJson) => {
                    return args.concat(
                        { nodeName: registry.StringLiteral.NODE_NAME, value: propertyJson.key },
                        propertyJson.value
                    );
                }, []),
            };
        }
        return resultJson;
    }
}