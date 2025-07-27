import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';

const {
    CallExpr,
} = registry;

export class PGArrayLiteral extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'ARRAY' },
                {
                    type: 'bracket_block',
                    syntax: { type: 'Expr', as: 'entries', arity: Infinity, itemSeparator, autoIndent: 2 },
                    autoSpacing: false,
                },
            ],
        };
    }

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null) {
        if ((options.toDialect || this.options.dialect) === 'mysql') {
            return {
                nodeName: CallExpr.NODE_NAME,
                name: 'JSON_ARRAY',
                arguments: this.entries().map((e) => e.jsonfy(options, transformCallback)),
            };
        }
        return super.jsonfy(options, transformCallback);
    }
}