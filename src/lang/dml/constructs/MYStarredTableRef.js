import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class MYStarredTableRef extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'mysql',
            syntax: [
                { type: 'ClassicTableRef', as: 'name' },
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

    name() { return this._get('name'); }

    starRef() { return this._get('star_ref'); }
}