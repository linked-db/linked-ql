import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class MYStarrableBasicTableExpr extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntax: [
                { type: 'TableRef', as: 'table_ref' },
                {
                    optional: true,
                    syntax: [
                        { type: 'punctuation', value: '.', autoSpacing: false },
                        { type: 'StarRef', as: 'star_ref', autoSpacing: false },
                    ],
                },
            ],
        };
    }

    /* AST API */

    tableRef() { return this._get('table_ref'); }

    starRef() { return this._get('star_ref'); }
}