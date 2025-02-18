import { _unwrap, _wrapped } from '@webqit/util/str/index.js';
import { ColumnRef } from '../../../expr/refs/ColumnRef.js';
import { Exprs } from '../../../expr/grammar.js';
import { Literal } from '../../../expr/Literal.js';

export const AbstractExprMixin = Class => class extends Class {

    #expr;
    #$expr;
    #columns = new Set;

	$bubble(eventType, eventSource) {
		if (['CONNECTED', 'DISCONNECTED'].includes(eventType) && eventSource instanceof ColumnRef) {
			if (eventType === 'DISCONNECTED') this.#columns.delete(eventSource.name().toLowerCase());
			else this.#columns.add(eventSource.name().toLowerCase());
		}
		return super.$bubble(eventType, eventSource);
	}

	expr(value) {
        if (!arguments.length || typeof value === 'boolean') {
			let expr = this.#expr;
			if (!expr && value === true && this.TYPE === 'DEFAULT') {
                expr = Literal.fromJSON(this, { value: null });
            }
            return expr;
        }
        if (typeof value === 'string') {
            const node = this.parse(value);
            value = node.NODE_NAME === 'PARENS' ? node.exprUnwrapped() : node;
        }
		if (this.$diffTagHydrate()) {
            this.#$expr = this.$castInputs([value], Exprs, this.#$expr, '$expr');
		} else this.#expr = this.$castInputs([value], Exprs, this.#expr, 'expr');
		return this;
    }

	$expr(...args) { return this.#$expr ?? this.expr(...args) }

    columns() {
        if (arguments.length) throw new Error(`The "columns" attributes for CHECK constraints is implicit.`);
        return [...this.#columns];
    }

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['expr'])
		);
	}

    generateDiff(nodeB, options) {
		return this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
			expr: this.$expr(!!nodeB.$expr())?.jsonfy(options),
		}, {
			expr: nodeB.$expr()?.jsonfy(options),
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
            expr: options.nodeNames === false ? this.#expr?.stringify() : this.#expr?.jsonfy(options),
			...jsonIn
        }, {
            expr: options.nodeNames === false ? this.#expr?.stringify() : this.#$expr?.jsonfy(options),
		}, options));
	}

    static parse(context, expr, parseCallback) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !($expr = $expr.match(new RegExp(`^${ this.TYPE.replace(/_/g, '\\s+') }\\s+([\\s\\S]+)$`, 'i'))?.[1])) return;
        const instance = new this(context);
        return instance
            .expr(parseCallback(instance, $expr))
            .name(name);
    }

    stringify() { return `${ super.stringify() } ${ this.$expr() }`; }
}