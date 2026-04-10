import { SchemaInference as BaseSchemaInference } from '../../../lang/SchemaInference.js';

export class EdgeSchemaInference extends BaseSchemaInference {

    #client;
    get client() { return this.#client; }

    constructor({ client, ...options }) {
        super(options);
        this.#client = client;
    }

    async showCreate(selector, options = {}) {
        return await this.#client._showCreate(selector, options);
    }
}