
import Lexer from '../Lexer.js';
import StatementNode from '../abstracts/StatementNode.js';
import AssignmentList from '../insert/AssignmentList.js';
import JoinClause from '../select/JoinClause.js';
import OrderByClause from '../select/OrderByClause.js';
import Condition from '../select/Condition.js';
import Assertion from '../select/Assertion.js';
import Table from '../select/Table.js';

export default class Update extends StatementNode {
	 
	/**
	 * Instance properties
	 */
	TABLE_LIST = [];
	JOIN_LIST = [];
	SET_CLAUSE = null;
	WHERE_CLAUSE = null;
	ORDER_BY_CLAUSE = null;
	LIMIT_CLAUSE = null;

	/**
	 * @returns Array
	 */
	get TABLES() { return this.TABLE_LIST; }

	/**
	 * Builds the statement's TABLE_LIST
	 * 
	 * .table(
	 * 		t1 => t1.name('tbl1').as('alias'),
	 * 		t2 => t2.name('tbl2')
	 * );
	 * 
	 * @return Void
	 */
	table(...tables) { return this.build('TABLE_LIST', tables, Table); }

	/**
	 * Builds the statement's JOIN_LIST (MySQL-specific)
	 * 
	 * .join(
	 * 		j1 => j1.name('tbl1').using('col').as('alias1'),
	 * 		j2 => j2.query(
	 * 			q => q.select().from()
	 * 		).on(
	 * 			c1 => c1.equals('a', 'b')
	 * 		).as('alias2')
	 * );
	 * 
	 * @return array
	 */
	join(table) { return this.build('JOIN_LIST', ['JOIN',table], JoinClause, 'join'); }

	/**
	 * A variant of the join()
	 * 
	 * @param  String table
	 * 
	 * @returns 
	 */
	leftJoin(table) { return this.build('JOIN_LIST', ['LEFT_JOIN',table], JoinClause, 'join'); }

	/**
	 * A variant of the join()
	 * 
	 * @param  String table
	 * 
	 * @returns 
	 */
	rightJoin(table) { return this.build('JOIN_LIST', ['RIGHT_JOIN',table], JoinClause, 'join'); }

	/**
	 * A variant of the join()
	 * 
	 * @param  String table
	 * 
	 * @returns 
	 */
	innerJoin(table) { return this.build('JOIN_LIST', ['INNER_JOIN',table], JoinClause, 'join'); }

	/**
	 * A variant of the join()
	 * 
	 * @param  String table
	 * 
	 * @returns 
	 */
	crossJoin(table) { return this.build('JOIN_LIST', ['CROSS_JOIN',table], JoinClause, 'join'); }

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
	 * Builds the statement's WHERE_CLAUSE
	 * 
	 * .where(
	 * 		c1 => c1.equals('a', 'b').and(
	 * 			c2 => c2.isNull('a')
	 * 		),
	 * 		c3 => c3.lessThan(2, 4)
	 * );
	 * 
	 * @return Object
	 */
	where(...wheres) { return this.build('WHERE_CLAUSE', wheres, Condition, 'and'); }

	/**
	 * Builds the statement's ORDER_BY_CLAUSE (MySQL-specific)
	 * 
	 * .orderBy(
	 * 		'col1',
	 * 		by => by.name('col2').withFlag('ASC'),
	 * 		by => by.func('CONCAT_WS', ... ).withFlag('ASC'),
	 * 		by => by.case(c => c.given(), c => c.when(...).then(...), c.else() ).ASC(),
	 * ).withRollup()
	 * 
	 * @return this
	 */
	orderBy(...orderBys) { return (this.build('ORDER_BY_CLAUSE', orderBys, OrderByClause, 'criterion'), this.ORDER_BY_CLAUSE/* for: .withRollup() */); }

	/**
	 * Sets the statement's LIMIT_CLAUSE (MySQL-specific)
	 * 
	 * .limit([3, 5]);
	 * 
	 * @return string
	 */
	limit(...limit) {
		if (!limit.every(l => typeof l === 'number')) throw new Error(`Limits must be of type number.`);
		this.LIMIT_CLAUSE = limit;
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			table_list: this.TABLE_LIST.map(t => t.toJson()),
			join_list: this.JOIN_LIST.map(t => t.toJson()),
			set_clause: this.SET_CLAUSE?.toJson(),
			where_clause: this.WHERE_CLAUSE?.toJson(),
			order_by_clause: this.ORDER_BY_CLAUSE?.toJson(),
			limit_clause: this.LIMIT_CLAUSE,
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.table_list)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.table(...json.table_list);
		if (json.join_list?.length) instance.join(...json.join_list);
		if (json.set_clause) instance.set(json.set_clause);
		if (json.where_clause) instance.where(json.where_clause);
		if (json.order_by_clause) instance.orderBy(json.order_by_clause);
		if (json.limit_clause) instance.limit(json.limit_clause);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = ['UPDATE'];
		if (this.FLAGS.length) sql.push(this.FLAGS.map(s => s.replace(/_/g, ' ')));
		sql.push(this.TABLE_LIST.join(', '));
		if (this.JOIN_LIST.length) sql.push(...this.JOIN_LIST);
		sql.push('SET', this.SET_CLAUSE);
		if (this.WHERE_CLAUSE) sql.push('WHERE', this.WHERE_CLAUSE);
		if (this.ORDER_BY_CLAUSE) sql.push(this.ORDER_BY_CLAUSE);
		if (this.LIMIT_CLAUSE) sql.push('LIMIT', this.LIMIT_CLAUSE);
		return sql.join(' ');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, withUac, mysqlIgnore, body ] = /^UPDATE(\s+WITH\s+UAC)?(?:\s+(IGNORE))?([\s\S]+)$/i.exec(expr) || [];
		if (!match) return;
		const instance = new this(context);
		if (withUac) instance.withFlag('WITH_UAC');
		if (mysqlIgnore) instance.withFlag(mysqlIgnore);
		const $body = this.mySubstitutePlaceholders(instance, body.trim());
		const clausesMap = { join:JoinClause, set:'SET', where:'WHERE', orderBy:OrderByClause, limit:'LIMIT' };
		const { tokens: [ tableSpec, ...tokens ], matches: clauses } = Lexer.lex($body, Object.values(clausesMap).map(x => typeof x === 'string' || x.test ? x : x.regex), { useRegex: 'i' });
		// TABLE_LIST
		for (const tblExpr of Lexer.split(tableSpec, [','])) {
			const node = parseCallback(instance, tblExpr.trim(), [Table]);
			instance.table(node);
		}
		// CLAUSES
		for (const clause of clauses) {
			const clauseRe = new RegExp(clause.replace(/\s+/g, ''), 'i'), clauseKey = Object.keys(clausesMap).find(key => clauseRe.test(key));
			// TABLE_REFERENCES
			if (clauseKey === 'set') {
				const node = parseCallback(instance, tokens.shift().trim(), [AssignmentList]);
				instance.set(node);
			}
			// WHERE_CLAUSE
			else if (clauseKey === 'where') {
				const node = parseCallback(instance, tokens.shift().trim(), [Condition,Assertion]);
				instance.where(node);
			}
			// LIMIT
			else if (clauseKey === 'limit') {
				instance.limit(parseInt(tokens.shift().trim()));
			}
			// JOIN|ORDER_BY
			else {
				const node = parseCallback(instance, `${ clause } ${ tokens.shift().trim() }`, [clausesMap[clauseKey]]);
				instance[clauseKey](node);
			}
		}
		return instance;
	}
}