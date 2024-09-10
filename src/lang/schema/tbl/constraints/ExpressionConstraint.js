import AbstractLevel1Constraint from './AbstractLevel1Constraint.js';
import AbstractExprConstraint from './AbstractExprConstraint.js';

export default class ExpressionConstraint extends AbstractExprConstraint(AbstractLevel1Constraint) {

    /**
	 * Instance properties
	 */
	STORED;
	$STORED;

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['STORED'].concat(super.WRITABLE_PROPS); }
    
	/**
	 * Gets/sets the expr.
     * 
	 * @param Bool val
	 * 
	 * @return this
	 */
	stored(val) {
		if (!arguments.length) return this[this.smartKey('STORED')];
		return (this[this.smartKey('STORED', true)] = !!val, this);
    }

    /**
	 * @inheritdoc
	 */
    diffWith(nodeB) {
        super.diffWith(nodeB)
        if (nodeB.stored() !== this.stored()) { this.stored(nodeB.stored()); }
		return this;
    }

	/**
	 * @inheritdoc
	 */
	toJSON() {
		return super.toJSON({
            stored: !!this.STORED,
			...(typeof this.$STORED === 'boolean' ? { $stored: this.$STORED } : {}),
		});
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		return super.fromJSON(context, json, () => {
			const instance = (new this(context)).stored(json.stored);
			instance.hardSet(json.$stored, val => instance.stored(val));
			return instance;
		});
	}

    /**
     * @returns String
     */
    stringify() { return `GENERATED ALWAYS AS (${ this.expr() })${ this.stored() ? ` STORED` : '' }`; }

    /**
     * @returns Object
     */
    static parse(context, expr) {
        let stored, { name, expr: $expr } = this.parseName(context, expr, true);
		[ , $expr, stored = '' ] = $expr.match(new RegExp(`^GENERATED\\s+ALWAYS\\s+AS\\s+\\(` + `([\\s\\S]+)` + `\\)(?:\\s+(VIRTUAL|STORED))?$`, 'i')) || [];
        if (!$expr) return;
		return (new this(context)).name(name).expr($expr).stored(/^STORED$/i.test(stored));
    }
}