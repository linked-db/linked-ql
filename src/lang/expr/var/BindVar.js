import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class BindVar extends AbstractNode {

	/* SYNTAX RULES */

    static get syntaxRules() { return { type: 'bind_var', as: '.' }; }

    /* AST API */

    value() { return Number(this._get('value')); }
}