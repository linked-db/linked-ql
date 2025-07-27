import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class CaseBranch extends AbstractNode {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'WHEN' },
            { type: 'Expr', as: 'condition' },
            { type: 'keyword', value: 'THEN' },
            { type: 'Expr', as: 'consequent' }
        ];
    }

    static get syntaxPriority() { return -1; }

    /* AST API */

    condition() { return this._get('condition'); }

    consequent() { return this._get('consequent'); }
}