
import { _unwrap } from '@webqit/util/str/index.js';
import Lexer from '../Lexer.js';
import StatementNode from '../abstracts/StatementNode.js';
import AssignmentList from './AssignmentList.js';
import OnConflictClause from './OnConflictClause.js';
import Identifier from '../select/Identifier.js';
import Select from '../select/Select.js';
import Table from '../select/Table.js';

export default class Insert extends StatementNode {
	 
	/**
	 * Instance properties
	 */
	TABLE = null;
	COLUMNS_LIST = [];
	VALUES_LIST = [];
	SET_CLAUSE = null;
	SELECT_CLAUSE = null;
	ON_CONFLICT_CLAUSE = null;

	/**
	 * @returns Array
	 */
	get TABLES() { return this.TABLE ? [this.TABLE] : []; }

	/**
	 * Builds the statement's TABLE
	 * 
	 * .into(
	 * 		t1 => t1.name('tbl1').as('alias'),
	 * );
	 * 
	 * @return Void
	 */
	into(table) { return this.build('TABLE', [table], Table); }

	/**
	 * Builds the statement's COLUMNS_LIST
	 * 
	 * .columns('col1', 'col2');
	 * 
	 * @return Void
	 */
	columns(...columns) { return this.build('COLUMNS_LIST', columns, Identifier); }

	/**
	 * Builds the statement's VALUES_LIST
	 * 
	 * .values(100, 22);
	 * 
	 * @return Void
	 */
	values(...values) { return this.VALUES_LIST.push(values); }

	/**
	 * Builds the statement's SET_CLAUSE
	 * 
	 * .set('col2', 22);
	 * .set(
	 * 		list => list.set('col2', 22)
	 * );
	 * 
	 * @return Void
	 */
	set(...assignments) { return this.build('SET_CLAUSE', assignments, AssignmentList, 'set'); }

	/**
	 * Builds the statement's SELECT_CLAUSE
	 * 
	 * .select(...);
	 * 
	 * @return Void
	 */
	select(query) { return this.build('SELECT_CLAUSE', [query], Select); }

	/**
	 * Builds the statement's ON_CONFLICT_CLAUSE
	 * 
	 * .onConflict(
	 * 		c => c.set('col1', 100),
	 * 		c => c.set('col2', 22)
	 * 		c => c.where(
	 * 			x => x.equals(...)
	 * 		)
	 * );
	 * 
	 * @return Void
	 */
	onConflict(...onConflictSpecs) { return this.build('ON_CONFLICT_CLAUSE', onConflictSpecs, OnConflictClause); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			table: this.TABLE.toJson(),
			columns_list: this.COLUMNS_LIST.map(c => c.toJson()),
			values_list: this.VALUES_LIST.map(v => v),
			set_clause: this.SET_CLAUSE?.toJson(),
			select_clause: this.SELECT_CLAUSE?.toJson(),
			on_conflict_clause: this.ON_CONFLICT_CLAUSE?.toJson(),
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!json?.table) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.into(json.table);
		if (json.columns_list?.length) instance.columns(...json.columns_list);
		for (const values of json.values_list || []) instance.values(...values);
		if (json.set_clause) instance.set(json.set_clause);
		if (json.select_clause) instance.select(json.select_clause);
		if (json.on_conflict_clause) instance.onConflict(json.on_conflict_clause);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = ['INSERT'];
		if (this.FLAGS.length) sql.push(this.FLAGS.map(s => s.replace(/_/g, ' ')));
		sql.push('INTO', this.TABLE);
		if (this.SET_CLAUSE) sql.push('SET', this.SET_CLAUSE);
		else {
			if (this.COLUMNS_LIST.length) sql.push(`(${ this.COLUMNS_LIST.join(', ') })`);
			if (this.SELECT_CLAUSE) sql.push(this.SELECT_CLAUSE);
			else sql.push('VALUES', `\n\t(${ this.VALUES_LIST.map(row => row.join(', ')).join(`),\n\t(`) })`);
		}
		if (this.ON_CONFLICT_CLAUSE) sql.push(this.ON_CONFLICT_CLAUSE);
		return sql.join(' ');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, withUac, mysqlIgnore, body ] = /^INSERT(\s+WITH\s+UAC)?(?:\s+(IGNORE))?(?:\s+INTO)?([\s\S]+)$/i.exec(expr) || [];
		if (!match ) return;
		const $body = this.mySubstitutePlaceholders(context, body.trim());
		const { tokens: [ tableSpec, payloadSpec, onConflictSpec ], matches: [insertType, onConflictClause] } = Lexer.lex($body, ['(VALUES|VALUE|SET|SELECT)', 'ON\\s+(DUPLICATE\\s+KEY|CONFLICT)'], { useRegex:'i' });
		const instance = new this(context);
		if (withUac) instance.withFlag('WITH_UAC');
		if (mysqlIgnore) instance.withFlag(mysqlIgnore);
		if (/^SET$/i.test(insertType)) {
			// INSERT ... SET
			instance.into(parseCallback(instance, tableSpec, [Table]));
			instance.set(parseCallback(instance, payloadSpec.trim(), [AssignmentList]));
		} else {
			const tableColumnSplit = Lexer.split(tableSpec, []);
			instance.into(parseCallback(instance, tableColumnSplit.shift().trim(), [Table]));
			if (tableColumnSplit.length) {
				const columns = Lexer.split(_unwrap(tableColumnSplit.shift().trim(), '(', ')'), [',']).map(c => parseCallback(instance, c.trim(), [Identifier]));
				instance.columns(...columns);
			}
			if (/^SELECT$/i.test(insertType)) {
				// INSERT ... SELECT
				instance.select(parseCallback(instance, `SELECT ${ payloadSpec }`));
			} else {
				// INSERT ... VALUES|VALUE
				for (const rowPayload of Lexer.split(payloadSpec, [','])) {
					const rowPayloadArray = Lexer.split(_unwrap(rowPayload.trim(), '(', ')'), [',']).map(valueExpr => parseCallback(instance, valueExpr.trim()));
					instance.values(...rowPayloadArray);
				}
			}
		}
		if (onConflictClause) { instance.onConflict(parseCallback(instance, `${ onConflictClause } ${ onConflictSpec }`, [OnConflictClause])); }
		return instance;
	}
}