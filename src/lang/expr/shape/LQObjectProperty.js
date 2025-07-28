import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

const {
    AggrCallExpr,
    ColumnRef,
} = registry;

export class LQObjectProperty extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'identifier', as: 'key' },
            {
                optional: true,
                syntax: [
                    { type: 'AggrNotation', as: 'is_aggr', optional: true },
                    { type: 'punctuation', value: ':', autoSpacing: false },
                    { type: 'Expr', as: 'value', assert: true },
                ],
                autoSpacing: false,
            },
        ];
    }

    static get syntaxPriority() { return -1; }

    get isProperty() { return true; }

    /* AST API */

    key() { return this._get('key'); }

    isAggr() { return this._get('is_aggr'); }

    value() { return this._get('value'); }

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null) {
        if (options.deSugar) {
            let valueJson;
            if (this.isAggr()) {
                // Note the below where we wrap value in an aggr call
                valueJson = {
                    nodeName: AggrCallExpr.NODE_NAME,
                    name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAYAGG' : 'JSON_AGG',
                    arguments: [this.value().jsonfy({ ...options, asAggr: true/* for use by any Back/DeefRef */ }, transformCallback)],
                };
            } else {
                // Note the below where we derive value, if not specified, from key
                valueJson = this.value()?.jsonfy(options, transformCallback)
                    ?? { nodeName: ColumnRef.NODE_NAME, value: this.key() };
            }
            // plus, we'll drop the is_aggr flag
            return {
                nodeName: LQObjectProperty.NODE_NAME,
                key: this.key(),
                is_aggr: false,
                value: valueJson
            };
        }
        return super.jsonfy(options, transformCallback);
    }
}