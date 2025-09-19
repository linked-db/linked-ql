import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class LQObjectProperty extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            syntaxes: [
                { type: 'ColumnRef0', as: 'star_ref' },
                [
                    { type: 'SelectItemAlias', as: 'key' },
                    {
                        optional: true,
                        syntax: [
                            { type: 'punctuation', value: ':' },
                            { type: 'Expr', as: 'value', assert: true },
                        ],
                        autoSpacing: false,
                    },
                ]
            ]
        };
    }

    static get syntaxPriority() { return -1; }

    get isProperty() { return true; }

    /* AST API */

    starRef() { return this._get('star_ref'); }

    key() { return this._get('key'); }

    value() { return this._get('value'); }

    /* DESUGARING API */

    jsonfy(options = {}, transformer = null, dbContext = null) {
        if (options.deSugar && !this.starRef()) {

            const keyNode = this.key();
            let asAggr, keyJson = transformer
                ? transformer.transform(keyNode, ($options = options) => keyNode.jsonfy($options), 'key', options)
                : keyNode.jsonfy(options);
            if (keyJson.is_aggr) ({ is_aggr: asAggr, ...keyJson } = keyJson);

            let valueNode = this.value();
            if (!valueNode) {
                valueNode = registry.ColumnRef1.fromJSON({ ...keyJson, nodeName: undefined });
                this._adoptNodes(valueNode);
            }

            let defaultTransform;

            if (asAggr && !(valueNode instanceof registry.LQDeepRef1)) {
                // Note the below where we wrap value in an aggr call
                defaultTransform = ($options = options, childTransformer = transformer) => ({
                    nodeName: registry.AggrCallExpr.NODE_NAME,
                    name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAYAGG' : 'JSON_AGG',
                    arguments: [valueNode.jsonfy($options, childTransformer, dbContext)],
                });
            } else {
                // Note the below where we derive value, if not specified, from key
                defaultTransform = ($options = options, childTransformer = transformer) => {
                    return valueNode.jsonfy($options, childTransformer, dbContext);
                };
            }

            const valueJson = transformer
                ? transformer.transform(valueNode, defaultTransform, 'value', { ...options, asAggr })
                : defaultTransform();

            // plus, we'll drop the is_aggr flag
            return {
                nodeName: LQObjectProperty.NODE_NAME,
                key: keyJson,
                value: valueJson
            };
        }
        return super.jsonfy(options, transformer, dbContext);
    }
}