
import { _unwrap } from '@webqit/util/str/index.js';
import AbstractConstraint from './abstracts/AbstractConstraint.js';
import Lexer from '../Lexer.js';

export default class TableLevelConstraint extends AbstractConstraint {

	/**
	 * Instance properties
	 */
	CONSTRAINT_NAME = '';
	TYPE = '';
	COLUMNS = [];
	DETAIL = {};

    /**
	 * @constructor
	 */
    constructor(context, constraintName, type, columns, detail = {}) {
        super(context);
        this.CONSTRAINT_NAME = constraintName;
        this.TYPE = type;
        this.COLUMNS = columns;
		this.DETAIL = detail;
    }

	/**
	 * @property String
	 */
	get BASENAME() { return this.CONTEXT/*Create|AlterTable*/.BASENAME; }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			...(this.CONSTRAINT_NAME ? { constraintName: this.CONSTRAINT_NAME } : {}),
			type: this.TYPE,
			...(this.COLUMNS.length ? { columns: this.COLUMNS } : {}),
			detail: this.DETAIL,
		};
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
        const sql = [this.stringifyName(), this.TYPE.replace(/_/i, ' ')];
		if (this.COLUMNS?.length && this.TYPE !== 'CHECK') sql.push(`(${ this.autoEsc(this.COLUMNS).join(',') })`);
		if (this.TYPE === 'FOREIGN_KEY') sql.push('REFERENCES', this.stringifyReference());
		else if (this.TYPE === 'CHECK') sql.push(this.stringifyCheck());
		return sql.filter(s => s).join(' ');
	}


    /**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const parseColumns = columnsExpr => Lexer.split(_unwrap(columnsExpr, '(', ')'), [',']).map(columnExpr => {
			return this.parseIdent(context, columnExpr.trim(), true)[0];
		});
		// Splice out the name part of the expression
		const { constraintName = '', expr: $expr } = this.parseName(context, expr, true);
		if (!$expr) return; // Not a constraint
		const [ $$expr, columnsExpr, ...rest ] = Lexer.split($expr, []);
		// PRIMARY KEY
		if (/^PRIMARY\s+KEY/i.test($$expr)) {
			return new this(context, constraintName.trim(), 'PRIMARY_KEY', parseColumns(columnsExpr));
		}
		// UNIQUE KEY]
		if (/^UNIQUE/i.test($$expr)) {
			return new this(context, constraintName.trim(), 'UNIQUE', parseColumns(columnsExpr));
		}
		// REFERENCE
		if (/^FOREIGN\s+KEY/i.test($expr)) {
			return new this(context, constraintName, 'FOREIGN_KEY', parseColumns(columnsExpr), this.parseReference(context, rest.join('').trim().replace(/^REFERENCES\s+/i, '')));
		}
		// CHECK
		if (/^CHECK/i.test($expr)) {
			return new this(context, constraintName, 'CHECK', [], this.parseCheck(columnsExpr.replace(/^CHECK\s+/i, '')));
		}
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json.constraintName !== 'string' && (typeof json?.type !== 'string' || !json.type.match(/PRIMARY_KEY|UNIQUE|CHECK|FOREIGN_KEY/i))) return;
		return new this(context, json.constraintName, json.type.replace(/UNIQUE_KEY/i, 'UNIQUE'), json.columns, json.references/*from user-defined schema*/ || json.expr/*from user-defined schema*/ || json.detail/*the standard*/ );
	}

	/**
	 * @inheritdoc
	 */
	static fromColumnLevelConstraint(columnLevelConstraint, columnName) {
		return new this(
			columnLevelConstraint.CONTEXT/*Column*/.CONTEXT/*Create|AlterTable*/,
			columnLevelConstraint.CONSTRAINT_NAME,
			columnLevelConstraint.TYPE,
			[columnName],
			columnLevelConstraint.DETAIL,
		);
	}
}