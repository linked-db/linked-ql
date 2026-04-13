import { SchemaInference } from '../../../lang/SchemaInference.js';

export class EdgeSchemaInference extends SchemaInference {

    #edgeClient;

    constructor({ edgeClient, ...options }) {
        super(options);
        this.#edgeClient = edgeClient;
    }

    async showCreate(selector, options = {}) {
        return await this.#edgeClient._showCreate(selector, options);
    }
}