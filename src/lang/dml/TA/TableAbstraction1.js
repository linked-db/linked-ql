import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class TableAbstraction1 extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'TableRef1', as: 'table_ref' },
            {
                optional: true,
                dialect: 'mysql',
                syntax: [
                    { type: 'punctuation', value: '.', autoSpacing: false },
                    { type: 'StarRef', as: 'my_star_ref', autoSpacing: false },
                ],
            },
        ];
    }

    /* AST API */

    tableRef() { return this._get('table_ref'); }

    myStarRef() { return this._get('my_star_ref'); }
}