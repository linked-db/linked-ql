
import { _unwrap } from '@webqit/util/str/index.js';
import AbstractConstraint from './abstracts/AbstractConstraint.js';

export default class ColumnLevelConstraint extends AbstractConstraint {

    /**
	 * Instance properties
	 */
	CONSTRAINT_NAME = '';
	TYPE = '';
	DETAIL = {};

    /**
	 * @constructor
	 */
    constructor(context, constraintName, type, detail = {}) {
        super(context);
        this.CONSTRAINT_NAME = constraintName;
        this.TYPE = type;
        this.DETAIL = detail;
    }

	/**
	 * @property String
	 */
	get BASENAME() { return this.CONTEXT/*Column*/.CONTEXT/*Create|AlterTable*/.BASENAME; }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
        const sql = [this.stringifyName()];
		if (this.TYPE === 'DEFAULT') sql.push('DEFAULT', this.DETAIL.expr ? `(${ this.DETAIL.expr })` : this.DETAIL.value);
		else if (['IDENTITY', 'EXPRESSION'].includes(this.TYPE)) {
			sql.push('GENERATED', this.DETAIL.always ? 'ALWAYS' : 'BY DEFAULT', 'AS');
			if (this.TYPE === 'IDENTITY') sql.push(`IDENTITY`);
			else if (this.DETAIL.expr) sql.push(this.DETAIL.expr, 'STORED');
		}
		else if (this.TYPE === 'FOREIGN_KEY') sql.push('REFERENCES', this.stringifyReference());
		else if (this.TYPE === 'CHECK') sql.push('CHECK', this.stringifyCheck());
		else sql.push(this.TYPE.replace(/(?<!AUTO)_/i, ' ')); // Think: AUTO_INCREMENT
		return sql.filter(s => s).join(' ');
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			...(this.CONSTRAINT_NAME ? { constraintName: this.CONSTRAINT_NAME } : {}),
			type: this.TYPE,
			detail: { ...this.DETAIL },
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Object.values(this.attrEquivalents).includes(json?.type)) return;
		return (new this(context, json.constraintName, json.type, json.detail)).withFlag(...(json.flags || []));
	}

    /**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		// Splice out the name part of the expression
		const { constraintName, expr: $expr } = this.parseName(context, expr, true);
		// GENERATED
		if (/^GENERATED/i.test($expr)) {
			const [ , alwaysOrByDefault, /*identity*/, expr ] = $expr.match(new RegExp(`^GENERATED\\s+` + `(ALWAYS|BY[ ]+DEFAULT)` + `\\s+AS` + `(?:\\s+(IDENTITY)?` + `|` + `(?:\\s+)?\\(` + `([\\s\\S]+)` + `` + `\\)(?:\\s+)?STORED$` + `)`, 'i'));
			if (expr) return new this(context, constraintName, 'EXPRESSION', { always: true, expr });
			// AS IDENTITY may not be explicitly mentioned in the case of an alter statement like: SET GENERATED { ALWAYS | BY DEFAULT }
			return new this(context, constraintName, 'IDENTITY', { always: /^ALWAYS$/i.test(alwaysOrByDefault) });
		}
		// DEFAULT
		if (/^DEFAULT/i.test($expr)) {
			const [ , value, $$expr, $$$expr ] = $expr.trim().match(/^DEFAULT\s+(?:([\w]+)|(\w[\s\S]+\))|\(([\s\S]+)\))$/i);
			return new this(context, constraintName, 'DEFAULT', value ? { value: /^[\d.]+$/.test(value) ? parseFloat(value) : value } : { expr: $$expr || _unwrap($$$expr, '(', ')') });
		}
		// PRIMARY_KEY|UNIQUE|AUTO_INCREMENT|NOT_NULL
		if (/^(PRIMARY[ ]+KEY|UNIQUE|AUTO_INCREMENT|NOT[ ]+NULL)/i.test($expr)) {
			return new this(context, constraintName, $expr.replace(/\s+/, '_').toUpperCase());
		}
		// FOREIGN_KEY
		if (/^REFERENCES/i.test($expr)) {
			return new this(context, constraintName, 'FOREIGN_KEY', this.parseReference(context, $expr.replace(/^REFERENCES\s+/i, '')));
		}
		// CHECK
		if (/^CHECK/i.test($expr)) {
			return new this(context, constraintName, 'CHECK', this.parseCheck($expr.replace(/^CHECK\s+/i, '')) );
		}
	}

    /**
     * @property Object
	 * 
	 * this order makes serialized output make more sense given we're looping over these somewhere in code
     */
    static attrEquivalents = {
        notNull: 'NOT_NULL',
        primaryKey: 'PRIMARY_KEY',
        uniqueKey: 'UNIQUE',
        check: 'CHECK',
        references: 'FOREIGN_KEY',
        identity: 'IDENTITY',
        expression: 'EXPRESSION',
        autoIncrement: 'AUTO_INCREMENT',
        default: 'DEFAULT', // Must appear after "identity" and "expression" for correct parsing of the keyword "DEFAULT"
    };
}