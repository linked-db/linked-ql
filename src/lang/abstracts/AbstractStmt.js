import { AbstractNode } from './AbstractNode.js';

export class AbstractStmt extends AbstractNode {
    
    get statementNode() { return this; }

    /* JSON API */

	#uuid;

    get uuid() {
        if (!this.#uuid) {
            this.#uuid = (0 | Math.random() * 9e6).toString(36);
        }
        return this.#uuid;
    }
}