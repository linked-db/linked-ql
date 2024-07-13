
import { _unwrap, _wrapped } from '@webqit/util/str/index.js';
import AbstractConstraint from './AbstractConstraint.js';

export default class AbstractExpr extends AbstractConstraint {

    /**
	 * Instance properties
	 */
	EXPR;
	$EXPR;

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['EXPR'].concat(super.WRITABLE_PROPS); }
    
	/**
	 * Gets/sets the expr.
     * 
	 * @param String expr
	 * 
	 * @return this
	 */
	expr(expr) {
        if (!arguments.length) return this[this.smartKey('EXPR')];
        return (this[this.smartKey('EXPR', true)] = expr, this);
    }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
            expr: this.EXPR,
			...(![undefined, null].includes(this.$EXPR) ? { $expr: this.$EXPR } : {}),
            ...super.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
        if ([undefined, null].includes(json?.expr)) return;
        return super.fromJson(context, json, () => {
            const instance = (new this(context)).expr(json.expr);
            instance.hardSet(json.$expr, val => instance.expr(val));
            return instance;
        });
	}

    /**
     * @returns String
     */
    stringify() { return `${ super.stringify() } (${ this.expr() })`; }

    /**
     * @returns Object
     */
    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !($expr = $expr.match(new RegExp(`^${ this.TYPE }\\s+([\\s\\S]+)$`, 'i'))?.[1])) return;
        const instance = (new this(context))
            .expr(_wrapped($expr.trim(), '(', ')') ? _unwrap($expr.trim(), '(', ')') : $expr)
            .name(name);
        return instance;
    }
}