import { AbstractNode } from './AbstractNode.js';

export const DDLSchemaMixin = (Class) => class extends Class {

	#result_schema;

	resultSchema() { return this.#result_schema; }

	static fromJSON(inputJson, options = {}, callback = null) {
		if (inputJson instanceof AbstractNode) {
			return super.fromJSON(inputJson, options, callback);
		}
		const { result_schema, ...restJson } = inputJson;

		const instance = super.fromJSON(restJson, options, callback);
		if (instance && result_schema) {
			if (!(result_schema instanceof AbstractNode)) {
				throw new Error(`Invalid Schema object passed at inputJson.result_schema`);
			}
			instance.#result_schema = result_schema;
		}
		return instance;
	}

	jsonfy(options = {}, transformer = null, dbContext = null) {
		let resultJson = super.jsonfy(options, transformer, dbContext);
		if (this.#result_schema) {
			resultJson = {
				...resultJson,
				result_schema: this.#result_schema,
			};
		}
		return resultJson;
	}
}