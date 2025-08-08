import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class SRFItem extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'CallExpr', as: 'expr' },
            {
                optional: true,
                syntax: [
                    {
                        syntaxes: [
                            { type: 'CompositeAlias', as: 'alias' },
                            [
                                { type: 'keyword', as: 'as_kw', value: 'AS', booleanfy: true },
                                { type: 'CompositeAlias', as: 'alias', assert: true }
                            ]
                        ]
                    }
                ]
            }
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    asKW() { return this._get('as_kw'); }

    alias() { return this._get('alias'); }
}