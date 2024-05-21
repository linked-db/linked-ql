
import Lexer from '../Lexer.js';
import StatementNode from '../abstracts/StatementNode.js';
import Placeholder from './Placeholder.js';
import Path from './Path.js';
import JoinClause from './JoinClause.js';
import GroupByClause from './GroupByClause.js';
import OrderByClause from './OrderByClause.js';
import WindowClause from './window/WindowClause.js';
import Condition from './Condition.js';
import Assertion from './Assertion.js';
import Field from './Field.js';
import Table from './Table.js';
import Aggr from './Aggr.js';

export default class Select extends StatementNode {
	
	/**
	 * Instance properties
	 */
	SELECT_LIST = [];
	FROM_LIST = [];
	JOIN_LIST = [];
	WHERE_CLAUSE = null;
	GROUP_BY_CLAUSE = null;
	HAVING_CLAUSE = null;
	WINDOW_CLAUSE = null;
	ORDER_BY_CLAUSE = null;
	OFFSET_CLAUSE = null;
	LIMIT_CLAUSE = null;

	/**
	 * @returns Array
	 */
	get TABLES() { return this.FROM_LIST; }

	/**
	 * @properties Array
	 */
	AGGRS = [];
	PATHS = [];
	VARS = [];
	SUBQUERIES = [];

	/**
	 * Builds the statement's SELECT_LIST
	 * 
	 * .select(
	 * 		'col1',
	 * 		f1 => f1.name('col2').as('alias1'),
	 * 		f2 => f1.func('CONCAT_WS', i => i.name(...) ),
	 * 		f3 => f1.aggr('SUM', 'col1'),
	 * 		f3 => f1.aggr(aggr => aggr.name('RANK').over( w => w.existing('w1') ) ),
	 * 		f3 => f1.aggr(aggr => aggr.name('RANK').over( w => w.partitionBy( p => p.name('col1') ) ) ),
	 * 		f3 => f1.math('+', 'col1', 'col2'),
	 * 		f3 => f1.math('/', i => i.name('col1'), i => i.func('AVG', ... ) ),
	 * 		f3 => f1.case( c => c.given(2), c => c.when(2).then(4), c => c.else(4) ).as('alias3'),
	 * 		f4 => f1.query(
	 * 			q => q.select().from()...
	 * 		).as('alias4'),
	 * );
	 * 
	 * @return Void
	 */
	select(...fields) { return this.build('SELECT_LIST', fields, Field); }

	/**
	 * Builds the statement's FROM_LIST
	 * 
	 * .from(
	 * 		t1 => t1.name('tbl1').as('alias'),
	 * 		t2 => t2.name('tbl2')
	 * );
	 * 
	 * @return Void
	 */
	from(...tables) { return (this.build('FROM_LIST', tables, Table), this.FROM_LIST[this.FROM_LIST.length - 1]/* for: .as() */); }

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
	 * Builds the statement's WHERE_CLAUSE
	 * 
	 * .where(
	 * 		c1 => c1.equals('a', 'b').and(
	 * 			c2 => c2.isNull('a')
	 * 		),
	 * 		c3 => c3.lessThan(2, 4)
	 * );
	 * 
	 * @return Void
	 */
	where(...wheres) { return this.build('WHERE_CLAUSE', wheres, Condition, 'and'); }

	/**
	 * Builds the statement's GROUP_BY_CLAUSE
	 * 
	 * .groupBy(
	 * 		'col1',
	 * 		by => by.name('col2'),
	 * 		by => by.func('CONCAT_WS', ... ),
	 * 		by => by.case(c => c.given(2), c => c.when(2).then(4), c => c.else(4) ),
	 * ).withRollup()
	 * 
	 * @return Void
	 */
	groupBy(...groupBys) { return (this.build('GROUP_BY_CLAUSE', groupBys, GroupByClause, 'criterion'), this.GROUP_BY_CLAUSE/* for: .withRollup() */); }

	/**
	 * Builds the statement's HAVING_CLAUSE
	 * 
	 * .having(
	 * 		c1 => c1.equals('a', 'b').and(
	 * 			c2 => c2.isNull('a')
	 * 		),
	 * 		c3 => c3.lessThan(2, 4)
	 * );
	 * 
	 * @return Void
	 */
	having(...wheres) { return this.build('HAVING_CLAUSE', wheres, Condition, 'and'); }

	/**
	 * Builds the statement's WINDOW_CLAUSE
	 * 
	 * .window(
	 * 		w1 => w1.name('w1').partitionBy(
	 * 			by => by.name(columnName)
	 * 		).orderBy(
	 * 			by => by.name(columnName)
	 * 		),
	 * 		w2 => w2.name('w2').extends('w1')
	 * )
	 * 
	 * @return Void
	 */
	window(...windows) { return this.build('WINDOW_CLAUSE', windows, WindowClause, 'define'); }

	/**
	 * Builds the statement's ORDER_BY_CLAUSE
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
	 * Sets the statement's OFFSET_CLAUSE
	 * 
	 * .offset(3);
	 * 
	 * @return string
	 */
	offset(offset) {
		if (typeof offset !== 'number') throw new Error(`Offsets must be of type number.`);
		this.OFFSET_CLAUSE = offset;
	}

	/**
	 * Sets the statement's LIMIT_CLAUSE
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
	 * Catalog certain nodes
	 * 
	 * @param Node node
	 * 
	 * @returns Void
	 */
    connectedNodeCallback(node) {
		if (node instanceof Aggr) this.AGGRS.push(node);
		if (node instanceof Path && !(node.CONTEXT instanceof Path)) this.PATHS.push(node);
		if (node instanceof Placeholder) this.VARS.push(node);
		if (node instanceof Select) this.SUBQUERIES.push(node);
	}

	/**
	 * @inheritdoc
	 */
	get expandable() { return this.PATHS.length > 0 || this.SUBQUERIES.some(q => q.expandable); }

	/**
	 * @inheritdoc
	 */
	async expand(asClone = false) {
		const instance = asClone ? this.clone() : this;
		if (!instance.expandable) return instance;
		for (const path of instance.PATHS) await path.plot();
		for (const query of instance.SUBQUERIES) await query.expand();
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			select_list: this.SELECT_LIST.map(s => s.toJson()),
			from_list: this.FROM_LIST.map(t => t.toJson()),
			join_list: this.JOIN_LIST.map(t => t.toJson()),
			where_clause: this.WHERE_CLAUSE?.toJson(),
			group_by_clause: this.GROUP_BY_CLAUSE?.toJson(),
			having_clause: this.HAVING_CLAUSE?.toJson(),
			window_clause: this.WINDOW_CLAUSE?.toJson(),
			order_by_clause: this.ORDER_BY_CLAUSE?.toJson(),
			offset_clause: this.OFFSET_CLAUSE,
			limit_clause: this.LIMIT_CLAUSE,
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.select_list)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.select(...json.select_list);
		if (json.from_list?.length) instance.from(...json.from_list);
		if (json.join_list?.length) instance.join(...json.join_list);
		if (json.where_clause) instance.where(json.where_clause);
		if (json.group_by_clause) instance.groupBy(json.group_by_clause);
		if (json.having_clause) instance.having(json.having_clause);
		if (json.window_clause) instance.window(json.window_clause);
		if (json.order_by_clause) instance.orderBy(json.order_by_clause);
		if (json.offset_clause) instance.offset(json.offset_clause);
		if (json.limit_clause) instance.limit(json.limit_clause);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify(params = {}) {
		const sql = ['SELECT'];
		if (this.FLAGS.length) sql.push(this.FLAGS.map(s => s.replace(/_/g, ' ')));
		sql.push(this.SELECT_LIST.join(', '));
		sql.push('FROM', this.FROM_LIST.join(', '));
		if (this.JOIN_LIST.length) sql.push(...this.JOIN_LIST);
		if (this.WHERE_CLAUSE) sql.push('WHERE', this.WHERE_CLAUSE);
		if (this.GROUP_BY_CLAUSE) sql.push(this.GROUP_BY_CLAUSE);
		if (this.HAVING_CLAUSE) sql.push('HAVING', this.HAVING_CLAUSE);
		if (this.WINDOW_CLAUSE) sql.push(this.WINDOW_CLAUSE);
		if (this.ORDER_BY_CLAUSE) sql.push(this.ORDER_BY_CLAUSE);
		if (this.OFFSET_CLAUSE) sql.push('OFFSET', this.OFFSET_CLAUSE);
		if (this.LIMIT_CLAUSE) sql.push('LIMIT', (Array.isArray(this.LIMIT_CLAUSE) ? this.LIMIT_CLAUSE : [this.LIMIT_CLAUSE]).join(','));
		return sql.join(' ');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, withUac, allOrDistinct, body ] = /^SELECT\s+(?:(WITH\s+UAC)\s+)?(ALL|DISTINCT)?([\s\S]+)$/i.exec(expr) || [];
		if (!match) return;
		const instance = new this(context);
		if (withUac) instance.withFlag('WITH_UAC');
		if (allOrDistinct) instance.withFlag(allOrDistinct);
		const $body = this.mySubstitutePlaceholders(instance, body.trim());
		const clausesMap = { from: { backtest: '^(?!.*\\s+DISTINCT\\s+$)', test: 'FROM' }, join:JoinClause, where:'WHERE', groupBy:GroupByClause, having:'HAVING', window:WindowClause, orderBy:OrderByClause, offset:'OFFSET', limit:'LIMIT' };
		const { tokens: [ fieldsSpec, ...tokens ], matches: clauses } = Lexer.lex($body, Object.values(clausesMap).map(x => typeof x === 'string' || x.test ? x : x.regex), { useRegex: 'i' });
		// SELECT_LIST
		for (const fieldExpr of Lexer.split(fieldsSpec, [','])) {
			const field = parseCallback(instance, fieldExpr.trim(), [Field]);
			instance.select(field);
		}
		// CLAUSES
		for (const clause of clauses) {
			const clauseRe = new RegExp(clause.replace(/\s+/g, ''), 'i'), clauseKey = Object.keys(clausesMap).find(key => clauseRe.test(key));
			// FROM_LIST
			if (clauseKey === 'from') {
				for (const tblExpr of Lexer.split(tokens.shift(), [','])) {
					const node = parseCallback(instance, tblExpr.trim(), [Table]);
					instance.from(node);
				}
			}
			// WHERE_CLAUSE|HAVING_CLAUSE
			else if (['where', 'having'].includes(clauseKey)) {
				const node = parseCallback(instance, tokens.shift().trim(), [Condition,Assertion]);
				instance[clauseKey](node);
			}
			// OFFSET|LIMIT
			else if (['offset', 'limit'].includes(clauseKey)) {
				const args = tokens.shift().split(',').map(s => parseInt(s.trim()));
				instance[clauseKey](...args);
			}
			// JOIN|GROUP_BY|WINDOW|ORDER_BY
			else {
				const node = parseCallback(instance, `${ clause } ${ tokens.shift().trim() }`, [clausesMap[clauseKey]]);
				instance[clauseKey](node);
			}
		}
		return instance;
	}
}