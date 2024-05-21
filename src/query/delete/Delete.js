
import Lexer from '../Lexer.js';
import Identifier from '../select/Identifier.js';
import StatementNode from '../abstracts/StatementNode.js';
import JoinClause from '../select/JoinClause.js';
import OrderByClause from '../select/OrderByClause.js';
import Condition from '../select/Condition.js';
import Assertion from '../select/Assertion.js';
import Table from '../select/Table.js';

/*
Syntax: 1 (Both; Order By and Limit: MySQL)
DELETE FROM somelog WHERE user = 'jcole'
	ORDER BY timestamp_column LIMIT 1;
*/
/*
Syntax 2: (MySQL)
DELETE t1, t2 FROM t1 INNER JOIN t2 INNER JOIN t3
	WHERE t1.id=t2.id AND t2.id=t3.id;
*/
/*
Syntax 3: (Both)
DELETE FROM t1, t2 USING t1 INNER JOIN t2 INNER JOIN t3
	WHERE t1.id=t2.id AND t2.id=t3.id;
*/

export default class Delete extends StatementNode {
	 
	/**
	 * Instance properties
	 */
	DELETE_LIST = [];
	FROM_LIST = [];
	USING_LIST = [];
	JOIN_LIST = [];
	WHERE_CLAUSE = null;
	ORDER_BY_CLAUSE = null;
	LIMIT_CLAUSE = null;

	/**
	 * @returns Array
	 */
	get TABLES() { return this.USING_LIST.length ? this.USING_LIST : this.FROM_LIST; }

	/**
	 * Builds an optional DELETE_LIST (for use with a FROM_LIST) (MySQL-specific)
	 * 
	 * .delete('t11, 't2');
	 * 
	 * @returns Void
	 */
	delete(...identifiers) { return this.build('DELETE_LIST', identifiers, Identifier); }

	/**
	 * Builds the statement's FROM_LIST
	 * - as either Table objects or Identifiers (in connection with a USING_LIST, in which case "false" should be first argument)
	 * 
	 * .from(false, 't11, 't2');
	 * 
	 * .from(
	 * 		t1 => t1.name('tbl1').as('alias'),
	 * 		t2 => t2.name('tbl2')
	 * );
	 * 
	 * @return Void
	 */
	from(...tablesOrIdentifiers) { return this.build('FROM_LIST', tablesOrIdentifiers, [Identifier,Table]); }

	/**
	 * Builds the statement's USING_LIST
	 * 
	 * .from(
	 * 		t1 => t1.name('tbl1').as('alias'),
	 * 		t2 => t2.name('tbl2')
	 * );
	 * 
	 * @return Void
	 */
	using(...tables) { return this.build('USING_LIST', tables, Table); }

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
			delete_list: this.DELETE_LIST.map(t => t.toJson()),
			from_list: this.FROM_LIST.map(t => t.toJson()),
			using_list: this.USING_LIST.map(t => t.toJson()),
			join_list: this.JOIN_LIST.map(t => t.toJson()),
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
		if (!Array.isArray(json?.from_list)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		if (json.delete_list?.length) instance.delete(...json.delete_list);
		instance.from(...json.from_list);
		if (json.using_list?.length) instance.using(...json.using_list);
		if (json.join_list?.length) instance.join(...json.join_list);
		if (json.where_clause) instance.where(json.where_clause);
		if (json.order_by_clause) instance.orderBy(json.order_by_clause);
		if (json.limit_clause) instance.limit(json.limit_clause);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = ['DELETE'];
		if (this.FLAGS.length) sql.push(this.FLAGS.map(s => s.replace(/_/g, ' ')));
		if (this.DELETE_LIST.length) sql.push(this.DELETE_LIST.join(', '));
		sql.push('FROM', this.FROM_LIST.join(', '));
		if (this.USING_LIST.length) sql.push('USING', this.USING_LIST.join(', '));
		if (this.JOIN_LIST.length) sql.push(...this.JOIN_LIST);
		if (this.WHERE_CLAUSE) sql.push('WHERE', this.WHERE_CLAUSE);
		if (this.ORDER_BY_CLAUSE) sql.push(this.ORDER_BY_CLAUSE);
		if (this.LIMIT_CLAUSE) sql.push('LIMIT', this.LIMIT_CLAUSE);
		return sql.join(' ');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, withUac, mysqlIgnore, body ] = /^DELETE(\s+WITH\s+UAC)?(?:\s+(IGNORE))?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context);
		if (withUac) instance.withFlag('WITH_UAC');
		if (mysqlIgnore) instance.withFlag(mysqlIgnore);
		const $body = this.mySubstitutePlaceholders(instance, body.trim());
		const clausesMap = { from: { backtest: '^(?!.*\\s+DISTINCT\\s+$)', test: 'FROM' }, using: { backtest: '^(?!.*\\s+JOIN\\s+)', test: 'USING' }, join:JoinClause, where:'WHERE', orderBy:OrderByClause, limit:'LIMIT' };
		const { tokens: [ maybeTablesSpec, ...tokens ], matches: clauses } = Lexer.lex($body, Object.values(clausesMap).map(x => typeof x === 'string' || x.test ? x : x.regex), { useRegex: 'i' });
		// MAYBE_TABLES_SPEC (BEFORE A FROM CLAUSE) - MYSQL
		for (const tblExpr of Lexer.split(maybeTablesSpec, [','])) {
			const node = parseCallback(instance, tblExpr.trim(), [Identifier]);
			instance.delete(node);
		}
		// CLAUSES
		for (const clause of clauses) {
			const clauseRe = new RegExp(clause.replace(/\s+/g, ''), 'i'), clauseKey = Object.keys(clausesMap).find(key => clauseRe.test(key));
			// TABLE_REFERENCES
			if (['from', 'using'].includes(clauseKey)) {
				for (const tblExpr of Lexer.split(tokens.shift(), [','])) {
					// If we have both "from" and "using" clauses (Syntax 3 above), then "using" is the main table references
					const asType = clauseKey === 'from' && clauses.some(s => s.toLowerCase() === 'using') ? Identifier : Table;
					const node = parseCallback(instance, tblExpr.trim(), [asType]);
					instance[clauseKey](node);
				}
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