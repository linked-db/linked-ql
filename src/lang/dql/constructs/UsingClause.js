import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class UsingClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'USING' },
            { type: ['ClassicColumnRef', 'SetConstructor'], as: 'column', assert: true }
        ];
    }

    /* AST API */

    column() { return this._get('column'); }
}