import { AbstractNode } from './AbstractNode.js';

export class AbstractStmt extends AbstractNode {

    #rands = new Map;
    _rand(type, { rands = this.#rands } = {}) {
        rands.set(type, !rands.has(type) ? 0 : rands.get(type) + 1);
        return `$${type}${rands.get(type)}`;
    }

    #hashes = new Map;
    _hash(value, type = undefined, { hashes = this.#hashes, rands } = {}) {
        if (!hashes.has(value)) {
            hashes.set(value, this._rand(type, { rands }));
        }
        return hashes.get(value);
    }

    #uuid;
    get uuid() {
        if (!this.#uuid) {
            this.#uuid = this._rand('query');
        }
        return this.#uuid;
    }

    get statementNode() { return this; }

    /* API */

    static fromJSON(inputJson, options = {}) {
        const { uuid, ...restJson } = inputJson;
        const node = super.fromJSON(restJson, options);
        if (uuid && node) node.#uuid = uuid;
        return node;
    }

    jsonfy(options = {}, transformCallback = null, linkedDb = null) {
        const resultJson = super.jsonfy(options, transformCallback, linkedDb);
        return { ...resultJson, uuid: this.#uuid };
    }
}