import { AbstractNode } from './AbstractNode.js';
import { registry } from '../registry.js';

export const OriginSchemasMixin = (Class) => class extends Class {

	#origin_schemas;

	originSchemas() { return this.#origin_schemas; }

	static fromJSON(inputJson, options = {}, callback = null) {
		if (!inputJson || inputJson instanceof AbstractNode) {
			return super.fromJSON(inputJson, options, callback);
		}
		const { origin_schemas, ...restJson } = inputJson;
		const instance = super.fromJSON(restJson, options, callback);
		if (instance && origin_schemas) {
			if (!Array.isArray(origin_schemas)) {
				throw new Error(`Invalid list passed at inputJson.origin_schemas`);
			}
			instance.#origin_schemas = origin_schemas;
		}
		return instance;
	}

	jsonfy(options = {}, transformer = null, dbContext = null) {
		let resultJson = super.jsonfy(options, transformer, dbContext);
		if (this.#origin_schemas && options.originSchemas !== false) {
			resultJson = {
				...resultJson,
				origin_schemas: this.#origin_schemas,
			};
		}
		return resultJson;
	}

	getOriginSchemas(transformer) {
		const originSchemas = [];
		let foundJSONSchema = false;
		for (const { resultSchema } of transformer.statementContext.artifacts.get('tableSchemas')) {
			if (resultSchema instanceof registry.JSONSchema) {
				if (foundJSONSchema) {
					// Not expect; not valid SQL; but however
					throw new Error(`Multiple anonymous origin schemas detected`);
				}
				foundJSONSchema = true;
			}
			originSchemas.push(resultSchema);
		}
		return originSchemas;
	}
}