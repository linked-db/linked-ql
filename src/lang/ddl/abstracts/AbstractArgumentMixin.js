export const AbstractArgumentMixin = Class => class extends Class {

	#argument;

	get EXPECTED_TYPES() { return this.constructor.EXPECTED_TYPES[this.KIND]; }

	argument(argument) {
		if (!arguments.length) return this.#argument;
		this.#argument = this.$castInputs([argument], this.EXPECTED_TYPES, this.#argument, 'argument');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.argument) return;
		return super.fromJSON(context, json, (instance) => {
			instance.argument(json.argument);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			argument: this.#argument?.jsonfy(options),
			...jsonIn
		});
	}
}