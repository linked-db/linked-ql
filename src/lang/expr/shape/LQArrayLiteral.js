import { AbstractLQShapeLiteral } from './abstracts/AbstractLQShapeLiteral.js';
import { registry } from '../../registry.js';

const {
    CallExpr,
} = registry;

export class LQArrayLiteral extends AbstractLQShapeLiteral {

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

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null) {
        if (options.deSugar) {
            return {
                nodeName: CallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAY' : 'JSON_BUILD_ARRAY',
                entries: this.entries().map((e) => e.jsonfy(options, transformCallback)),
            };
        }
        return super.jsonfy(options, transformCallback);
    }
}