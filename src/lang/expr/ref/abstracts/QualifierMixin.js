import { _isObject } from '@webqit/util/js/index.js';
import { ErrorRefAmbiguous } from './ErrorRefAmbiguous.js';
import { ErrorRefUnknown } from './ErrorRefUnknown.js';
import { registry } from '../../../registry.js';

export const QualifierMixin = (Class) => class extends Class {

	/* DESUGARING API */
	
	jsonfy(options = {}, transformCallback = null) {
		let resultJson = super.jsonfy(options, transformCallback);
		if (!resultJson.qualifier && (options.deSugar || options.fullyQualified)) {
			const qualifier = this.qualifier(true).jsonfy(options, transformCallback);
			resultJson = {
				...resultJson,
				qualifier: qualifier.value ? qualifier : undefined
			};
		}
		return resultJson;
	}
	/* API */

	qualifier(init = null) {
		const qualifier = this._get('qualifier');
		if (!arguments.length) return qualifier;
		// Return a fresh instance
		if (init !== true && typeof init !== 'string') {
			throw new TypeError('"init" must be true or a string.');
		}
		const name = this._get('value');
		if (!name && !qualifier && init === true) {
			throw new TypeError('Can\'t auto-resolve qualifier for anonymous ident.');
		}
		const QualifierNode = registry[this.constructor._qualifierType];
		const instance = QualifierNode.fromJSON(init === true && qualifier?.jsonfy() || { value: init !== true ? '' : init });
		this._adoptNodes(instance);
		// If typeof init === 'string'
		// - it becomes value of instance, and that's all
		// If init === true:
		// - if qualifier, instance is first a clone of qualifier
		// - if not qualifier, then instance is initially empty
		if (init === true && !qualifier) {
			const entriesField = `${this.constructor._refKind}s`;
			const possibleQualifierSchemas = instance.selectSchema((possibleQualifierSchema) => possibleQualifierSchema._has(entriesField, name));
			if (possibleQualifierSchemas.length > 1) {
				const refs = possibleQualifierSchemas.map((s) => this.constructor.fromJSON({ qualifier: s.name(), value: this.value() }));
				throw new ErrorRefAmbiguous(`[${this.clone({ fullyQualified: true })}]: ${this.value()} is ambiguous. (Is it ${refs.join(' or ')}?)`);
			} else if (!possibleQualifierSchemas.length) {
				throw new ErrorRefUnknown(`[${this.clone({ fullyQualified: true })}]: ${this.value()} is unknown.`);
			}
			instance._set('value', possibleQualifierSchemas[0].name());
		}
		return instance;
	}

	selectSchema(filter = null) {
		const name = this.value();
		const possibleParentSchemas = this.qualifier(true).schema();
		const entriesField = `${this.constructor._refKind}s`;
		return possibleParentSchemas.reduce((schemas, possibleParentSchema) => {
			// "If" we have a name...
			const matches = name
				// narrow down to us within possibleParentSchema
				? [].concat(possibleParentSchema._get(entriesField, name) || [])
				// otherwise, select all children of our kind
				: possibleParentSchema._get(entriesField);
			// Optionally further filter matches
			return schemas.concat(filter ? matches.filter(filter) : matches);
		}, []);
	}

	identifiesAs(ident) {
		if (ident instanceof Class) {
			return this._eq(this.value(), ident.value(), 'ci')
				&& (!ident.qualifier() || !!this.qualifier(true).identifiesAs(ident.qualifier()));
		}
		return super.identifiesAs(ident);
	}

	static fromJSON(inputJson, options = {}, callback = null) {
		if (typeof inputJson === 'string') {
			inputJson = { value: inputJson, qualifier: null };
		} else if (Array.isArray(inputJson) && inputJson.some((s) => typeof s === 'string') && (inputJson = inputJson.slice())) {
			inputJson = { value: inputJson.pop(), qualifier: inputJson.pop() };
		} else if (!_isObject(inputJson)) return;
		return super.fromJSON(inputJson, options, callback);
	}
};