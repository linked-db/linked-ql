import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class OrderElement extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'Expr', as: 'expr' },
            {
                optional: true,
                syntaxes: [
                    { type: 'keyword', value: ['ASC', 'DESC'], as: 'dir' },
                    { type: 'PGOrderOperator', as: 'dir' },
                ]
            },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', value: 'NULLS' },
                    { type: 'keyword', as: 'nulls_spec', value: ['FIRST', 'LAST'], assert: true },
                ]
            },
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    dir() { return this._get('dir'); }

    nullsSpec() { return this._get('nulls_spec'); }
}