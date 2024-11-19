export const AbstractReferenceMixin = Class => class extends Class {

	#reference;

	get REF_TYPES() { return this.constructor.REF_TYPES[this.KIND]; }

	reference(reference) {
		if (!arguments.length) return this.#reference;
		this.#reference = this.$castInputs([reference], this.REF_TYPES, this.#reference, 'reference');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json.reference) instance.reference(json.reference);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			reference: this.#reference?.jsonfy(options),
			...jsonIn
		});
	}
}