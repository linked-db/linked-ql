import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class AbstractLiteral extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxPriority() { return 49; }
    
    /* AST API */

    value() { return this._get('value'); }
}