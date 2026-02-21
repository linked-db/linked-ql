import { AbstractNode } from './AbstractNode.js';
import { registry } from '../registry.js';

export const ResultSchemaMixin = (Class) => class extends Class {

	#result_schema;

	resultSchema() { return this.#result_schema; }

	static fromJSON(inputJson, options = {}, callback = null) {
		if (!inputJson || inputJson instanceof AbstractNode) {
			return super.fromJSON(inputJson, options, callback);
		}
		let { result_schema, ...restJson } = inputJson;
		const instance = super.fromJSON(restJson, options, callback);
		if (instance && result_schema) {
			if (!(result_schema instanceof AbstractNode)) {
				if (result_schema?.nodeName) {
					const opts = { dialect: options.dialect, assert: true };
					result_schema = result_schema.nodeName === registry.JSONSchema.NODE_NAME
						? registry.JSONSchema.fromJSON({ entries: result_schema.entries }, opts)
						: registry.JSONSchema.fromJSON({ entries: [result_schema] }, opts).entries()[0];
				} else throw new Error(`Invalid Schema object passed at inputJson.result_schema`);
			}
			instance.#result_schema = result_schema;
		}
		return instance;
	}

	jsonfy(options = {}, transformer = null, schemaInference = null) {
		let resultJson = super.jsonfy(options, transformer, schemaInference);
		if (this.#result_schema && options.resultSchemas !== false) {
			resultJson = {
				...resultJson,
				result_schema: this.#result_schema,
			};
		}
		return resultJson;
	}
}