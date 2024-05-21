import { _after } from '@webqit/util/str/index.js';
import { matchReferentialRule, serializeReferentialRule } from './ColumnLevelConstraint.js';
import ConstraintInterface from './ConstraintInterface.js';

/**
 * ---------------------------
 * Constraint class
 * ---------------------------
 */				

export default class TableLevelConstraint extends ConstraintInterface {

    /**
	 * @constructor
	 */
    constructor(constraintName, type, columns, detail, params = {}) {
        super();
        this.constraintName = constraintName;
        this.type = type;
        this.columns = columns;
		if (type === 'FOREIGN KEY') {
			this.references = detail;
		} else if (type === 'CHECK') {
			this.expr = detail;
		}
		this.params = params;
    }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			...(this.constraintName ? { constraintName: this.constraintName } : {}),
			type: this.type,
			...(this.columns.length ? { columns: this.columns } : {}),
			// Either of the below
			...(this.references ? { references: { ...this.references } } : {}),
			...(this.expr ? { expr: this.expr } : {}),
		};
	}

	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
        let sql = `${ this.constraintName?.match(/[a-zA-Z]+/i) ? `CONSTRAINT ${ this.constraintName } ` : '' }${ this.type }`;
		if (this.columns?.length && this.type !== 'CHECK') { sql += ` (${ this.columns.join(',') })`; }
		if (this.type === 'FOREIGN KEY') {
			const database = this.references.database || this.params.database;
			sql += ` REFERENCES ${ database ? `${ database }.` : `` }${ this.references.table } (${ this.references.columns.join(',') })`;
			if (this.references.matchRule) { sql += ` MATCH ${ this.references.matchRule }`; }
			if (this.references.updateRule) { sql += ` ON UPDATE ${ serializeReferentialRule(this.references.updateRule) }`; }
			if (this.references.deleteRule) { sql += ` ON DELETE ${ serializeReferentialRule(this.references.deleteRule) }`; }
		} else if (this.type === 'CHECK') {
			sql += ` (${ this.expr })`;
		}
		return sql;
	}

    /**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		const [ idMatch, constraintName = '' ] = (new RegExp(`^${ this.constraintNameRe.source }`, 'i')).exec(expr) || [];
		if (idMatch) { expr = _after(expr, idMatch); }
		// PRIMARY KEY
		const [ primaryKeyMatch, columns ] = (new RegExp(`^${ this.primaryKeyRe.source }`, 'i')).exec(expr) || [];
		if (primaryKeyMatch) return new this(constraintName.trim(), 'PRIMARY KEY', columns.split(',').map(s => s.trim()), null, params);
		// UNIQUE KEY
		const [ uniqueKeyMatch, _columns ] = (new RegExp(`^${ this.uniqueKeyRe.source }`, 'i')).exec(expr) || [];
		if (uniqueKeyMatch) return new this(constraintName.trim(), 'UNIQUE', _columns.split(',').map(s => s.trim()), null, params);
		// CHECK
		const [ checkMatch, _expr ] = (new RegExp(`^${ this.checkRe.source }`, 'i')).exec(expr) || [];
		if (checkMatch) return new this(constraintName.trim(), 'CHECK', [], _expr, params);
		// FOREIGN KEY
		const [ foreignKeyReMatch, localColumns, referencedDb, referencedTable, referencedColumns, referentialRules = '' ] = (new RegExp(`^${ this.foreignKeyRe.source }`, 'i')).exec(expr) || [];
		if (foreignKeyReMatch) return new this(constraintName.trim(), 'FOREIGN KEY', localColumns.split(',').map(s => s.trim()), {
			database: referencedDb,
			table: referencedTable,
			columns: referencedColumns.split(',').map(s => s.trim()),
			matchRule: matchReferentialRule(referentialRules, 'MATCH'),
			updateRule: matchReferentialRule(referentialRules, 'UPDATE'),
			deleteRule: matchReferentialRule(referentialRules, 'DELETE'),
		}, params);
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (json.constraintName || (typeof json.type === 'string' && json.type.match(/PRIMARY[ ]+KEY|UNIQUE([ ]+KEY)?|CHECK|FOREIGN[ ]+KEY/i))) {
			return new this(json.constraintName, json.type.replace(/UNIQUE[ ]+KEY/i, 'UNIQUE'), json.columns, json.references || json.expr, params);
		}
	}

	/**
	 * @inheritdoc
	 */
	static fromColumnLevelConstraint(columnLevelConstraint, columnName) {
		return new this(
			columnLevelConstraint.constraintName, 
			columnLevelConstraint.attribute === 'REFERENCES' ? 'FOREIGN KEY' : columnLevelConstraint.attribute, 
			[columnName], 
			columnLevelConstraint.attribute === 'CHECK' ? columnLevelConstraint.detail.expr : columnLevelConstraint.detail,
			columnLevelConstraint.params
		);
	}

    /**
	 * @property RegExp
	 */
	static constraintNameRe = /(?:CONSTRAINT[ ]+(\w+[ ]+)?)?/;
	static primaryKeyRe = /PRIMARY[ ]+KEY(?:[ ]+)?\(([^\)]+)\)/;
	static uniqueKeyRe = /UNIQUE(?:[ ]+KEY)?(?:[ ]+)?\(([^\)]+)\)/;
	static checkRe = /CHECK(?:(?:[ ]+)?\(([^\)]+)\))/;
	static foreignKeyRe = /FOREIGN[ ]+KEY(?:[ ]+)?\(([^\)]+)\)(?:[ ]+)?REFERENCES[ ]+(?:(\w+)\.)?(\w+)(?:[ ]+)?\(([^\)]+)\)(?:[ ]+)?(.+)?$/;

}