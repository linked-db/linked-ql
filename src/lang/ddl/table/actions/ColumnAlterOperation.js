import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class ColumnAlterOperation extends AbstractNode {

    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    [
                        { type: 'keyword', value: 'SET' },
                        {
                            syntaxes: [
                                [
                                    { type: 'keyword', as: 'kind', value: 'DEFAULT' },
                                    { type: 'Expr', as: 'expr', assert: true },
                                ],
                                [
                                    { type: 'keyword', value: 'NOT' },
                                    { type: 'keyword', as: 'kind', value: 'NULL' },
                                ],
                            ],
                        },
                    ],
                    [
                        { type: 'keyword', value: 'DROP' },
                        {
                            syntaxes: [
                                { type: 'keyword', as: 'kind', value: 'DEFAULT' },
                                [
                                    { type: 'keyword', value: 'NOT' },
                                    { type: 'keyword', as: 'kind', value: 'NULL' },
                                ],
                            ],
                        },
                    ],
                ],
            },
        ];
    }

    kind() { return this._get('kind'); }

    expr() { return this._get('expr'); }
}
