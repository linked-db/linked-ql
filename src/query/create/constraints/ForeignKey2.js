
import Lexer from '../../Lexer.js';
import ForeignKey1 from './ForeignKey1.js';

export default class ForeignKey2 extends ForeignKey1 {

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
    stringify() {
		const namePart = this.stringifyName();
		// ---------- So that super.stringify() does not process that
		const name = this.NAME;
		const $name = this.$NAME;
		this.NAME = null;
		this.$NAME = null;
		// ----------
		const sql = `${ namePart }FOREIGN KEY (${ this.autoEsc(this.columns()).join(', ') }) ${ super.stringify() }`;
		// ---------- Restoration
		this.NAME = name;
		this.$NAME = $name;
		// ----------
		return sql;
	}

    /**
     * @returns Object
     */
    static parse(context, expr, parseCallback) {
		const { name = '', expr: $expr } = this.parseName(context, expr, true);
		if (!$expr || !/^FOREIGN\s+KEY/i.test($expr)) return; // Not a constraint
		const [ , columnsExpr, ...rest ] = Lexer.split($expr, []);
		const instance = super.parse(context, rest.join('').trim(), parseCallback);
		return instance.name(name).columns(this.parseColumns(context, columnsExpr));
    }
}