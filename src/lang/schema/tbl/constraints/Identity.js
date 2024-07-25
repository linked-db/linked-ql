
import AbstractLevel1Constraint from './AbstractLevel1Constraint.js';
import AutoIncrement from './AutoIncrement.js';

export default class Identity extends AbstractLevel1Constraint {

    /**
	 * Instance properties
	 */
	ALWAYS;
	$ALWAYS;

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['ALWAYS'].concat(super.WRITABLE_PROPS); }
    
	/**
	 * Gets/sets the expr.
     * 
	 * @param Bool val
	 * 
	 * @return this
	 */
	always(val) {
		if (!arguments.length) return this[this.smartKey('ALWAYS')];
		return (this[this.smartKey('ALWAYS', true)] = !!val, this);
    }

    /**
	 * @inheritdoc
	 */
    diffWith(nodeB) {
        super.diffWith(nodeB)
        if (nodeB.always() !== this.always()) { this.always(nodeB.always()); }
		return this;
    }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
            always: !!this.ALWAYS,
			...(typeof this.$ALWAYS === 'boolean' ? { $always: this.$ALWAYS } : {}),
            ...super.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		return super.fromJson(context, json, () => {
			const instance = (new this(context)).always(json.always);
			instance.hardSet(json.$always, val => instance.always(val));
			return instance;
		});
	}

    /**
     * @returns String
     */
    stringify() {
		if (this.params.dialect === 'mysql') return (new AutoIncrement(this.CONTEXT)).stringify();
		return `GENERATED ${ this.always() ? 'ALWAYS' : 'BY DEFAULT' } AS IDENTITY`;
	}

    /**
     * @returns Object
     */
    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
		if (!$expr || !($expr = $expr.match(new RegExp(`^GENERATED\\s+` + `(ALWAYS|BY[ ]+DEFAULT)` + `(?:\\s+AS\\s+IDENTITY)?$`, 'i'))?.[1])) return;
		return (new this(context)).name(name).always(/^ALWAYS$/i.test($expr));
    }
}