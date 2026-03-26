import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class IndexUsingClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'USING' },
            { type: 'Identifier', as: 'method', assert: true },
        ];
    }

    /* AST API */

    method() { return this._get('method'); }
}
