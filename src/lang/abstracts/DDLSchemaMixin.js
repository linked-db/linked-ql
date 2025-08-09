import { AbstractNode } from './AbstractNode.js';

export const DDLSchemaMixin = (Class) => class extends Class {

	#result_schema;

	ddlSchema() { return this.#result_schema; }

	static fromJSON(inputJson, options = {}, callback = null) {
		if (inputJson instanceof AbstractNode) {
			return super.fromJSON(inputJson, options, callback);
		}
		const { result_schema, ...restJson } = inputJson;
		const instance = super.fromJSON(restJson, options, callback);
		if (instance) {
			instance.#result_schema = result_schema;
		}
		return instance;
	}

	jsonfy(options = {}, transformer = null, linkedDb = null) {
		let resultJson = super.jsonfy(options, transformer, linkedDb);
		if (this.#result_schema) {
			resultJson = {
				...resultJson,
				result_schema: this.#result_schema,
			};
		}
		return resultJson;
	}
}