import { AbstractLevel1Constraint } from './abstracts/AbstractLevel1Constraint.js';
import { AbstractExprConstraint } from './abstracts/AbstractExprMixin.js';

export class ExpressionConstraint extends AbstractExprConstraint(AbstractLevel1Constraint) {

	#stored;
	#$stored;

	stored(value) {
		if (!arguments.length) return this.#stored;
		if (typeof value !== 'boolean') throw new Error(`The "stored" directive must be of type boolean`);
		if (this.$diffTagHydrate()) {
			this.#$stored = value;
		} else this.#stored = value;
		return this;
    }

	$stored() { return this.#$stored ?? this.#stored; }

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['stored'])
		);
	}

    generateDiff(nodeB, options) {
		return this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
			stored: this.$stored(),
		}, {
			stored: nodeB.$stored(),
		}, options);
    }

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			instance.stored(!!json.stored);
			instance.$diffTagHydrate(json.$stored, ($stored) => instance.stored($stored));
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, this.diffMergeJsons({
            stored: this.#stored,
			...jsonIn
		}, {
			stored: this.#$stored,
		}, options));
	}

    static parse(context, expr) {
        let stored, { name, expr: $expr } = this.parseName(context, expr, true);
		[ , $expr, stored = '' ] = $expr.match(new RegExp(`^GENERATED\\s+ALWAYS\\s+AS\\s+\\(` + `([\\s\\S]+)` + `\\)(?:\\s+(VIRTUAL|STORED))?$`, 'i')) || [];
        if (!$expr) return;
		return (new this(context)).name(name).expr($expr).stored(/^STORED$/i.test(stored));
    }

    stringify() { return `GENERATED ALWAYS AS (${ this.$expr() })${ this.$stored() ? ` STORED` : '' }`; }
}