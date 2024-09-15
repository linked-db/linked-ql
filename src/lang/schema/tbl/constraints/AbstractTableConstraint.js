import Lexer from '../../../Lexer.js';

export default Class => class extends Class {

    /**
	 * Instance properties
	 */
	COLUMNS = [];
	$COLUMNS = [];

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['COLUMNS'].concat(super.WRITABLE_PROPS); }

	/**
	 * Sets/gets the constraint columns,
	 * 
	 * @param Void|Array columns
	 * 
	 * @returns this
	 */
	columns(columns) {
		if (!arguments.length) return this[this.smartKey('COLUMNS')];
		return (this[this.smartKey('COLUMNS', true)] = [].concat(columns), this);
    }

    diffWith(consB) {
        super.diffWith(consB)
        if (!this.isSame(consB.columns(), this.columns())) { this.columns(consB.columns()); }
		return this;
    }

	toJSON() {
		return super.toJSON({
			columns: this.COLUMNS,
			...(this.$COLUMNS.length ? { $columns: this.$COLUMNS } : {}),
		});
	}

	static fromJSON(context, json) {
        if (!json?.columns?.length) return;
		return super.fromJSON(context, json, () => {
			const instance = (new this(context)).columns(json.columns);
			instance.hardSet(json.$columns, val => instance.columns(val));
			return instance;
		});
	}

    /**
     * @returns String
     */
    stringify() {
		if (this.TYPE === 'FOREIGN_KEY') return super.stringify();
		return `${ super.stringify() } (${ this.autoEsc(this.columns()).join(', ') })`;
	}

    /**
     * @returns Object
     */
    static parse(context, expr, parseCallback) {
		if (this.TYPE === 'FOREIGN_KEY') return super.parse(context, expr, parseCallback);
		const [ $expr, columnsExpr ] = Lexer.split(expr, []);
		const instance = super.parse(context, $expr.trim(), parseCallback);
		if (!instance) return;
		return instance.columns(this.parseColumns(context, columnsExpr));
    }
}