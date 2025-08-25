import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';

export class PGTypedArrayLiteral extends AbstractNodeList {

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

    static morphsTo() { return registry.CallExpr; }

    /* TYPESYS API */

    dataType() { return registry.DataType.fromJSON({ value: 'JSON' }); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if ((options.toDialect || this.options.dialect) === 'mysql') {
            resultJson = {
                nodeName: registry.CallExpr.NODE_NAME,
                name: 'JSON_ARRAY',
                arguments: resultJson.entries,
            };
        }
        return resultJson;
    }
}