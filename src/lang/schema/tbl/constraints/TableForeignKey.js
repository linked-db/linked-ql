import Lexer from '../../../Lexer.js';
import ForeignKey from './ForeignKey.js';
import AbstractTableConstraint from './AbstractTableConstraint.js';

export default class TableForeignKey extends AbstractTableConstraint(ForeignKey) {

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