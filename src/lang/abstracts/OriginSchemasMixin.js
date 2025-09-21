import { AbstractNode } from './AbstractNode.js';

export const OriginSchemasMixin = (Class) => class extends Class {

	#origin_schemas;

	originSchemas() { return this.#origin_schemas; }

	static fromJSON(inputJson, options = {}, callback = null) {
		if (inputJson instanceof AbstractNode) {
			return super.fromJSON(inputJson, options, callback);
		}
		const { origin_schemas, ...restJson } = inputJson;

		const instance = super.fromJSON(restJson, options, callback);
		if (instance && origin_schemas) {
			if (!(origin_schemas instanceof Map)) {
				throw new Error(`Invalid Schema object passed at inputJson.origin_schemas`);
			}
			instance.#origin_schemas = origin_schemas;
		}
		return instance;
	}

	jsonfy(options = {}, transformer = null, dbContext = null) {
		let resultJson = super.jsonfy(options, transformer, dbContext);
		if (this.#origin_schemas) {
			resultJson = {
				...resultJson,
				origin_schemas: this.#origin_schemas,
			};
		}
		return resultJson;
	}
}