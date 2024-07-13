
import Lexer from '../../Lexer.js';
import UniqueKey1 from "./UniqueKey1.js";

export default class UniqueKey2 extends UniqueKey1 {

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

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			columns: this.COLUMNS,
			...(this.$COLUMNS.length ? { $columns: this.$COLUMNS } : {}),
            ...super.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!json?.columns?.length) return;
        return super.fromJson(context, json, () => {
			const instance = (new this(context)).columns(json.columns);
			instance.hardSet(json.$columns, val => instance.columns(val));
			return instance;
		});
	}

    /**
     * @returns String
     */
    stringify() { return `${ super.stringify() } (${ this.autoEsc(this.columns()).join(', ') })`; }

    /**
     * @returns Object
     */
    static parse(context, expr, parseCallback) {
		const [ $expr, columnsExpr ] = Lexer.split(expr, []);
		const instance = super.parse(context, $expr.trim(), parseCallback);
		if (!instance) return;
		return instance.columns(this.parseColumns(context, columnsExpr));
    }
}