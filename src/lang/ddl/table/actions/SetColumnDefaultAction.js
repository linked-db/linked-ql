import { AbstractNode } from '../../../abstracts/AbstractNode.js';
import { registry } from '../../../registry.js';

export class SetColumnDefaultAction extends AbstractNode {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof SetColumnDefaultAction) return super.fromJSON(inputJson, options, callback);
        const { nodeName, expr } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!expr) return;
        return new this({ expr: registry.Expr.fromJSON(expr, options) }, options);
    }

    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    { type: 'keyword', value: 'SET DEFAULT' },
                    [
                        { type: 'keyword', value: 'SET' },
                        { type: 'keyword', value: 'DEFAULT' },
                    ],
                ],
            },
            { type: 'Expr', as: 'expr', assert: true },
        ];
    }

    expr() { return this._get('expr'); }

    operationKind() { return 'SET DEFAULT'; }
}
