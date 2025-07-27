import { AbstractNode } from './AbstractNode.js';

export class AbstractStmt extends AbstractNode {

    #rand = 0;
    _rand(key) {
        return `${key}::${this.#rand++}`;
        return `${key}::${(0 | Math.random() * 9e6).toString(36)}`;
    }

    #uuid;
    get uuid() {
        if (!this.#uuid) this.#uuid = this._rand('query');
        return this.#uuid;
    }

    static fromJSON(inputJson, options = {}) {
        const { uuid, ...restJson } = inputJson;
        const node = super.fromJSON(restJson, options);
        if (uuid && node) node.#uuid = uuid;
        return node;
    }

    jsonfy(options = {}) {
        const resultJson = super.jsonfy(options);
        return { ...resultJson, uuid: this.#uuid };
    }
}