import { AbstractLevel1Constraint } from './abstracts/AbstractLevel1Constraint.js';
import { AutoIncrementConstraint } from './AutoIncrementConstraint.js';

export class IdentityConstraint extends AbstractLevel1Constraint {

	#always;
	#$always;

	always(value) {
		if (!arguments.length) return this.#always;
		if (typeof value !== 'boolean') throw new Error(`The "always" directive must be of type boolean`);
		if (this.$diffTagHydrate()) {
			this.#$always = value;
		} else this.#always = value;
		return this;
    }

	$always() { return this.#$always ?? this.#always; }

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['always'])
		);
	}

    generateDiff(nodeB, options) {
		return this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
			always: this.$always(),
		}, {
			always: nodeB.$always(),
		}, options);
    }

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			instance.always(!!json.always);
			instance.$diffTagHydrate(json.$always, ($always) => instance.always($always));
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, this.diffMergeJsons({
            always: this.#always,
			...jsonIn
		}, {
			always: this.#$always,
		}, options));
	}

    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
		if (!$expr || !($expr = $expr.match(new RegExp(`^GENERATED\\s+` + `(ALWAYS|BY[ ]+DEFAULT)` + `(?:\\s+AS\\s+IDENTITY)?$`, 'i'))?.[1])) return;
		return (new this(context)).name(name).always(/^ALWAYS$/i.test($expr));
    }

    stringify() {
		if (this.params.dialect === 'mysql') return (new AutoIncrementConstraint(this.CONTEXT)).stringify();
		return `GENERATED ${ this.$always() ? 'ALWAYS' : 'BY DEFAULT' } AS IDENTITY`;
	}
}