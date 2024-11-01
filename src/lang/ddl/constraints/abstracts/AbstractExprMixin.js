import { _unwrap, _wrapped } from '@webqit/util/str/index.js';

export const AbstractExprConstraint = Class => class extends Class {

    #expr;
    #$expr;

	expr(expr) {
		if (!arguments.length) return this.#expr;
        if (typeof expr !== 'string') throw new Error(`Expression values must be of type string`);
		if (this.$diffTagHydrate()) {
			this.#$expr = expr;
		} else this.#expr = expr;
		return this;
    }

	$expr() { return this.#$expr ?? this.#expr }

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['expr'])
		);
	}

    generateDiff(nodeB, options) {
		return this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
			expr: this.$expr(),
		}, {
			expr: nodeB.$expr(),
		}, options);
    }

    /* -- I/O */

	static fromJSON(context, json, callback = null) {
        if (typeof json?.expr === 'undefined') return;
        return super.fromJSON(context, json, (instance) => {
            instance.expr(json.expr);
            instance.$diffTagHydrate(json.$expr, ($expr) => instance.expr($expr));
            callback?.(instance);
        });
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, this.diffMergeJsons({
            expr: this.#expr,
			...jsonIn
        }, {
            expr: this.#$expr,
		}, options));
	}

    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !($expr = $expr.match(new RegExp(`^${ this.TYPE.replace(/_/g, '\\s+') }\\s+([\\s\\S]+)$`, 'i'))?.[1])) return;
        const instance = (new this(context))
            .expr(_wrapped($expr.trim(), '(', ')') ? _unwrap($expr.trim(), '(', ')') : $expr)
            .name(name);
        return instance;
    }

    stringify() { return `${ super.stringify() } (${ this.$expr() })`; }
}