import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGOrderOperator extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'USING' },
                { type: 'operator', as: '.', assert: true },
            ],
        };
    }

    /* AST API */

    value() { return this._get('value'); }
}