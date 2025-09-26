import { ErrorRefUnknown } from './ErrorRefUnknown.js';
import { ErrorRefAmbiguous } from './ErrorRefAmbiguous.js';
import { AbstractNode } from '../../../abstracts/AbstractNode.js';
import { ResultSchemaMixin } from '../../../abstracts/ResultSchemaMixin.js';
import { TypeSysMixin } from '../../../abstracts/TypeSysMixin.js';
import { Identifier } from '../Identifier.js';

export class AbstractClassicRef extends ResultSchemaMixin(TypeSysMixin(Identifier)) {

    #resolution;

    resolution() { return this.#resolution; }

    lookup(transformer, schemaInference) { return []; }

    resolve(transformer, schemaInference) {
        const resultSet = this.lookup(null, transformer, schemaInference) || [];
        const objectType = this.constructor.name.match(/schema/i) ? 'Schema' : (this.constructor.name.match(/table/i) ? 'Table' : 'Column');
        if (resultSet.length > 1) {
            throw new ErrorRefAmbiguous(`[${this.parentNode?.parentNode || this.parentNode || this}] ${objectType} ${this} is ambiguous. (Is it ${resultSet.join(' or ')}?)`);
        } else if (!resultSet.length) {
            throw new ErrorRefUnknown(`[${this.parentNode?.parentNode || this.parentNode || this}] ${objectType} ${this} does not exist.`);
        }
        return resultSet[0];
    }

	static fromJSON(inputJson, options = {}, callback = null) {
		if (!inputJson || inputJson instanceof AbstractNode) {
			return super.fromJSON(inputJson, options, callback);
		}
		const { resolution, ...restJson } = inputJson;
		const instance = super.fromJSON(restJson, options, callback);
		if (instance && resolution) {
			if (typeof resolution !== 'string') {
				throw new Error(`Invalid "resolution" hint passed at inputJson.resolution`);
			}
			instance.#resolution = resolution;
		}
		return instance;
	}

	jsonfy(options = {}, transformer = null, schemaInference = null) {
		let resultJson = super.jsonfy(options, transformer, schemaInference);
		if (this.#resolution) {
			resultJson = {
				...resultJson,
				resolution: this.#resolution,
			};
		}
		return resultJson;
	}
}