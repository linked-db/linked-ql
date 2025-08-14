import { AbstractNode } from './AbstractNode.js';

export class AbstractStmt extends AbstractNode {
    
    get statementNode() { return this; }

    /* JSON API */

	#uuid;

    get uuid() {
        if (!this.#uuid) {
            this.#uuid = `$query${(0 | Math.random() * 9e6).toString(36)}`;
        }
        return this.#uuid;
    }

	static fromJSON(inputJson, options = {}, callback = null) {
		if (inputJson instanceof AbstractNode) {
			return super.fromJSON(inputJson, options, callback);
		}
		const { uuid, ...restJson } = inputJson;
		const instance = super.fromJSON(restJson, options, callback);
		if (instance) {
			instance.#uuid = uuid;
		}
		return instance;
	}

	jsonfy(options = {}, transformer = null, linkedDb = null) {
		let resultJson = super.jsonfy(options, transformer, linkedDb);
		if (this.#uuid) {
			resultJson = {
				uuid: this.#uuid,
				...resultJson,
			};
		}
		return resultJson;
	}
}