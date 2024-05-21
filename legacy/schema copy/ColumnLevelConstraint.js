import { _after, _wrapped } from '@webqit/util/str/index.js';
import ConstraintInterface from './ConstraintInterface.js';
import { _isObject } from '@webqit/util/js/index.js';

/**
 * ---------------------------
 * Constraint class
 * ---------------------------
 */				

export default class ColumnLevelConstraint extends ConstraintInterface {

    /**
	 * @constructor
	 */
    constructor(constraintName, attribute, detail, params) {
        super();
        this.constraintName = constraintName;
        this.attribute = attribute;
        this.detail = detail;
        this.params = params;
    }

	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
        let sql = `${ this.constraintName?.match(/[a-zA-Z]+/i) ? `CONSTRAINT ${ this.constraintName } ` : '' }${ ['IDENTITY', 'EXPRESSION'].includes(this.attribute) ? 'GENERATED' : this.attribute }`;
		if (this.attribute === 'REFERENCES') {
			const database = this.detail.database || this.params.database;
			sql += ` ${ database ? `${ database }.` : `` }${ this.detail.table } (${ this.detail.columns.join(',') })`;
			if (this.detail.matchRule) { sql += ` MATCH ${ this.detail.matchRule }`; }
			if (this.detail.updateRule) { sql += ` ON UPDATE ${ serializeReferentialRule(this.detail.updateRule) }`; }
			if (this.detail.deleteRule) { sql += ` ON DELETE ${ serializeReferentialRule(this.detail.deleteRule) }`; }
		}
		if (this.attribute === 'DEFAULT') {
			sql += (this.detail.expr ? ` (${ this.detail.expr })` : ` ${ this.detail.value }`);
		} else if (['IDENTITY', 'EXPRESSION'].includes(this.attribute)) {
			sql += ` ${ this.detail.always ? 'ALWAYS' : 'BY DEFAULT' }`;
			if (this.attribute === 'IDENTITY') {
				sql += ` AS IDENTITY`;
			} else if (this.detail.expr) {
				// The AS clause could be unavailable when in an alter column statement (pg): ALTER [ COLUMN ] column_name { SET GENERATED { ALWAYS | BY DEFAULT } | SET sequence_option | RESTART [ [ WITH ] restart ] } [...]
				sql += ` AS (${ this.detail.expr }) STORED`;
			}
		} else if (this.attribute === 'CHECK') {
			sql += ` (${ this.detail.expr })`;
		}
		return sql;
	}

	/**
	 * @inheritdoc
	 */
	toJson() { return { constraintName: this.constraintName, attribute: this.attribute, detail: this.detail }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (!Object.values(this.attrEquivalents).includes(json.attribute)) return;
		return new this(json.constraintName, json.attribute, json.detail, params);
	}

    /**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		const regex = constraintName => new RegExp(`${ this.constraintNameRe.source }${ this[ constraintName ].source }`, 'i');
		// PRIMARY KEY
		const [ primaryKeyMatch, constraintName0 = '' ] = regex('primaryKeyRe').exec(expr) || [];
		if (primaryKeyMatch) return new this(constraintName0.trim(), 'PRIMARY KEY', {}, { ...params, wholeMatch: primaryKeyMatch });
		// UNIQUE KEY
		const [ uniqueKeyMatch, constraintName2 = '' ] = regex('uniqueKeyRe').exec(expr) || [];
		if (uniqueKeyMatch) return new this(constraintName2.trim(), 'UNIQUE', {}, { ...params, wholeMatch: uniqueKeyMatch });
		// CHECK
		const [ checkMatch, constraintName3 = '', _expr ] = regex('checkRe').exec(expr) || [];
		if (checkMatch) return new this(constraintName3.trim(), 'CHECK', { expr: _expr }, { ...params, wholeMatch: checkMatch });
		// REFERENCES
		const [ referencesMatch, constraintName1 = '', referencedDb, referencedTable, referencedColumns, referentialRules = '' ] = regex('referencesRe').exec(expr) || [];
		if (referencesMatch) return new this(constraintName1.trim(), 'REFERENCES', {
			database: referencedDb,
			table: referencedTable,
			columns: referencedColumns.split(',').map(s => s.trim()),
			matchRule: matchReferentialRule(referentialRules, 'MATCH'),
			updateRule: matchReferentialRule(referentialRules, 'UPDATE'),
			deleteRule: matchReferentialRule(referentialRules, 'DELETE'),
		}, { ...params, wholeMatch: referencesMatch });
		// IDENTITY
		const [ identityMatch, constraintName4a = '', generationFn ] = regex('identityRe').exec(expr) || [];
		if (identityMatch) return new this(constraintName4a.trim(), 'IDENTITY', { always: /^ALWAYS$/i.test(generationFn) }, { ...params, wholeMatch: identityMatch });
		// EXPRESSION
		const [ expressionMatch, constraintName4b = '', altGenerationFn, $$expr ] = regex('expressionRe').exec(expr) || [];
		if (expressionMatch) return new this(constraintName4b.trim(), 'EXPRESSION', { always: $$expr || /^ALWAYS$/i.test(altGenerationFn) ? true : false, expr: $$expr }, { ...params, wholeMatch: expressionMatch });
		// DEFAULT; Must appear after "identity" and "expression" for correct parsing of the keyword "DEFAULT"
		const [ defaultMatch, constraintName5 = '', literal, $expr ] = regex('defaultRe').exec(expr) || [];
		if (defaultMatch) return new this(constraintName5.trim(), 'DEFAULT', literal ? { value: literal } : { expr: $expr }, { ...params, wholeMatch: defaultMatch });
		// OTHER; Would have been fine as first, but interfares with CHECK(col is NOT NULL)
		const [ otherMatch, constraintName6 = '', attribute ] = regex('otherRe').exec(expr) || [];
		if (otherMatch) return new this(constraintName6.trim(), attribute.replace(/\s+/g, ' ').toUpperCase(), {}, { ...params, wholeMatch: otherMatch });
	}

    /**
	 * @property RegExp
	 */
	static constraintNameRe = /(?:CONSTRAINT[ ]+(\w+[ ]+)?)?/;
	static otherRe = /(AUTO_INCREMENT|NOT[ ]+NULL)/;
	static primaryKeyRe = /PRIMARY[ ]+KEY/;
	static uniqueKeyRe = /UNIQUE(?:[ ]+KEY)?/;
	static checkRe = /CHECK(?:(?:[ ]+)?\(([^\)]+)\))/;
	static referencesRe = /REFERENCES[ ]+(?:(\w+)\.)?(\w+)(?:[ ]+)?\(([^\)]+)\)(?:[ ]+)?(.+)?$/;
	static identityRe = /GENERATED[ ]+(ALWAYS|BY[ ]+DEFAULT)[ ]+AS[ ]IDENTITY/;
	static expressionRe = /GENERATED[ ]+(?:(ALWAYS|BY[ ]+DEFAULT)$|ALWAYS[ ]+AS[ ]+\(([^\)]+)\)(?:[ ]+STORED)?)?/;
	static defaultRe = /DEFAULT(?:[ ]+(\w+)|(?:[ ]+)?\(([^\)]+)\))?/;

    /**
     * @property Object
	 * 
	 * this order makes serialized output make more sense given we're looping over these somewhere in code
     */
    static attrEquivalents = {
        notNull: 'NOT NULL',
        primaryKey: 'PRIMARY KEY',
        uniqueKey: 'UNIQUE',
        check: 'CHECK',
        references: 'REFERENCES',
        identity: 'IDENTITY',
        expression: 'EXPRESSION',
        autoIncrement: 'AUTO_INCREMENT',
        default: 'DEFAULT', // Must appear after "identity" and "expression" for correct parsing of the keyword "DEFAULT"
    };
}

export const serializeReferentialRule = rule => typeof rule === 'object' && rule ? `${ rule.rule } (${ rule.columns.join(',') })` : rule;

export const matchReferentialRule = (str, type) => {
	if (type === 'MATCH') return str.match(/MATCH[ ]+(\w+)/i)?.[1];
	const referentialActionRe = /(NO[ ]+ACTION|RESTRICT|CASCADE|(SET[ ]+NULL|SET[ ]+DEFAULT)(?:[ ]+\(([^\)]+)\))?)/;
	const [ , keyword1, keyword2, keyword2Columns ] = str.match(new RegExp(`ON[ ]+${ type }[ ]+${ referentialActionRe.source }`, 'i')) || [];
	return keyword2 ? (!keyword2Columns ? keyword2 : { rule: keyword2, columns: keyword2Columns.split(',').map(s => s.trim()) }) : keyword1;
};