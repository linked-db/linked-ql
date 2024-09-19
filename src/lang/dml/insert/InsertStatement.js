
import { _unwrap } from '@webqit/util/str/index.js';
import Lexer from '../../Lexer.js';
import DimensionsAPI from './DimensionsAPI.js';
import AbstractStatement from '../AbstractStatement.js';
import AssignmentList from './AssignmentList.js';
import OnConflictClause from './OnConflictClause.js';
import Select from '../select/SelectStatement.js';
import Table from '../../components/Table.js';
import Field from '../../components/Field.js';
import ValuesList from './ValuesList.js';
import ColumnsList from './ColumnsList.js';

export default class InsertStatement extends DimensionsAPI(AbstractStatement) {
	 
	/**
	 * Instance properties
	 */
	TABLE = null;
	COLUMNS_CLAUSE = null;
	VALUES_LIST = [];
	SET_CLAUSE = null;
	SELECT_CLAUSE = null;
	ON_CONFLICT_CLAUSE = null;
	RETURNING_LIST = [];

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
	 * Builds the statement's COLUMNS_CLAUSE
	 * 
	 * .columns('col1', 'col2');
	 * 
	 * @return Void
	 */
	columns(...columns) {
		if (!arguments.length) return this.COLUMNS_CLAUSE;
		return this.build('COLUMNS_CLAUSE', columns, ColumnsList, 'entries');
	}

	/**
	 * Builds the statement's VALUES_LIST
	 * 
	 * .values(100, 22);
	 * 
	 * @return Void
	 */
	values(...values) {
		if (!arguments.length) return this.VALUES_LIST;
		return this.build('VALUES_LIST', values, ValuesList, 'entries');
	}

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
	set(...assignments) {
		if (!arguments.length) return this.SET_CLAUSE;
		return this.build('SET_CLAUSE', assignments, AssignmentList, 'set');
	}

	/**
	 * Builds the statement's SELECT_CLAUSE
	 * 
	 * .select(...);
	 * 
	 * @return Void
	 */
	select(query) {
		if (!arguments.length) return this.SELECT_CLAUSE;
		return this.build('SELECT_CLAUSE', [query], Select);
	}

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
	onConflict(...onConflictSpecs) {
		if (!arguments.length) return this.ON_CONFLICT_CLAUSE;
		return this.build('ON_CONFLICT_CLAUSE', onConflictSpecs, OnConflictClause, 'entries');
	}
	
	/** 
	* @return Void
	*/
   	returning(...fields) {
		if (!arguments.length) return this.RETURNING_LIST;
		return this.build('RETURNING_LIST', fields, Field);
	}

	toJSON() {
		return {
			table: this.TABLE.toJSON(),
			columns_clause: this.COLUMNS_CLAUSE?.toJSON(),
			values_list: this.VALUES_LIST.map(valuesList => valuesList.toJSON()),
			set_clause: this.SET_CLAUSE?.toJSON(),
			select_clause: this.SELECT_CLAUSE?.toJSON(),
			on_conflict_clause: this.ON_CONFLICT_CLAUSE?.toJSON(),
			returning_list: this.RETURNING_LIST.slice(0),
			flags: this.FLAGS,
		};
	}

	static fromJSON(context, json) {
		if (!json?.table) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.into(json.table);
		if (json.columns_clause) instance.columns(json.columns_clause);
		for (const entry of (json.values_list || [])) instance.values(...entry.entries);
		if (json.set_clause) instance.set(json.set_clause);
		if (json.select_clause) instance.select(json.select_clause);
		if (json.on_conflict_clause) instance.onConflict(json.on_conflict_clause);
		if (json.returning_list?.length) instance.returning(...json.returning_list);
		return instance;
	}
	
	stringify() {
		const sql = ['INSERT'];
		if (this.FLAGS.length) sql.push(this.FLAGS.map(s => s.replace(/_/g, ' ')));
		sql.push('INTO', this.TABLE);
		if (this.SET_CLAUSE) sql.push('SET', this.SET_CLAUSE);
		else {
			if (this.COLUMNS_CLAUSE) sql.push(this.COLUMNS_CLAUSE);
			if (this.SELECT_CLAUSE) sql.push(this.SELECT_CLAUSE);
			else sql.push('VALUES', this.VALUES_LIST.join(', '));
		}
		if (this.ON_CONFLICT_CLAUSE) sql.push(this.ON_CONFLICT_CLAUSE);
		if (this.RETURNING_LIST.length) sql.push('RETURNING', this.RETURNING_LIST.join(', '));
		return sql.join(' ');
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, withUac, mysqlIgnore, body ] = /^INSERT(\s+WITH\s+UAC)?(?:\s+(IGNORE))?(?:\s+INTO)?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match ) return;
		const instance = new this(context);
		if (withUac) instance.withFlag('WITH_UAC');
		if (mysqlIgnore) instance.withFlag(mysqlIgnore);
		const $body = this.mySubstitutePlaceholders(context, body.trim());
		const clausesMap = { payload:'(VALUES|VALUE|SET|SELECT)', onConflict:'ON\\s+(DUPLICATE\\s+KEY|CONFLICT)', returning:'RETURNING' };
		const { tokens: [ tableSpec, ...tokens ], matches: clauses } = Lexer.lex($body, Object.values(clausesMap).map(x => x), { useRegex: 'i' });
		// CLAUSES
		for (const clause of clauses) {
			const $clause = clause.replace(/\s+/g, '');
			const clauseKey = Object.keys(clausesMap).find(key => (new RegExp(clausesMap[key], 'i')).test($clause));
			if (clauseKey === 'payload') {
				if (/^SET$/i.test($clause)) {
					// INSERT ... SET
					instance.into(parseCallback(instance, tableSpec, [Table]));
					instance.set(parseCallback(instance, tokens.shift().trim(), [AssignmentList]));
				} else {
					const tableColumnSplit = Lexer.split(tableSpec, []);
					instance.into(parseCallback(instance, tableColumnSplit.shift().trim(), [Table]));
					if (tableColumnSplit.length) {
						instance.columns(parseCallback(instance, tableColumnSplit.shift().trim(), [ColumnsList]));
					}
					if (/^SELECT$/i.test($clause)) {
						// INSERT ... SELECT
						instance.select(parseCallback(instance, `SELECT ${ tokens.shift() }`));
					} else {
						// INSERT ... VALUES|VALUE
						for (const rowPayload of Lexer.split(tokens.shift(), [','])) {
							instance.values(parseCallback(instance, rowPayload.trim(), [ValuesList]));
						}
					}
				}
			} else if (clauseKey === 'onConflict') {
				instance.onConflict(parseCallback(instance, `${ $clause } ${ tokens.shift().trim() }`, [OnConflictClause]));
			} else if (clauseKey === 'returning') {
				instance.returning(...Lexer.split(tokens.shift(), [',']).map(field => parseCallback(instance, field.trim(), [Field])));
			}
		}
		return instance;
	}

    $trace(request, ...args) {
		if (request === 'get:TABLE_NODE') return this.TABLE;
		return super.$trace(request, ...args);
	}
}