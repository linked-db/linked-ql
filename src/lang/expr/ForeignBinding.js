import { _isObject } from '@webqit/util/js/index.js';
import { Binding } from './Binding.js';
		
export class ForeignBinding extends Binding {

	#resolutionPath = [];

	get resolutionPath() { return this.#resolutionPath.slice(); }

	get isForeign() { return true; }

	static get expose() { return {}; }

	resolve(sourceQuery, resultData) {
		if (!['INSERT_STATEMENT', 'UPSERT_STATEMENT'].includes(sourceQuery?.constructor.NODE_NAME)) throw new Error(`Source query must be an INSERT or UPSERT statement`);
		if (this.#resolutionPath[0] !== sourceQuery.uuid) return;
		if (!Array.isArray(resultData)) throw new Error(`Input source must be an array`);
		if (!_isObject(resultData[this.#resolutionPath[1]])) throw new Error(`Input source does not have an object at: #${this.resolutionPath[1]}`);
		const value = resultData[this.#resolutionPath[1]][this.#resolutionPath[2]];
		if (!value) throw new Error(`Input source does not have a value at: [${this.resolutionPath}]`);
		return this.value(value);
	}

	static fromJSON(context, json, callback = null) {
		if (!Array.isArray(json?.resolutionPath) || json.resolutionPath.length !== 3) return;
		return super.fromJSON(context, { offset: 0/*just default*/, ...json }, (instance) => {
			instance.#resolutionPath = json.resolutionPath.slice();
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			resolutionPath: this.#resolutionPath.slice(),
			...jsonIn,
		});
	}
	
	stringify() {
		if (this.value()) return super.stringify();
		return this.params.dialect === 'mysql' ? `$${ this.#resolutionPath.join('.') }` : `$${ this.#resolutionPath.join('.') }`;
	}
}
