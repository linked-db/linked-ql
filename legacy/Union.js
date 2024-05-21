
import Lexer from '@webqit/util/str/Lexer.js';
import OrderBy from './OrderBy.js';
import Node from '../src/parser/Node.js';

export default class Union extends Node {
	
	/**
	 * Instance properties
	 */
	expr;

	/**
	 * @constructor
	 */
	constructor(context, query, queries, orderBy = null, limit = null) {
		super(context);
		this.QUERY = query;
		this.QUERIES = queries;
		this.ORDER_BY_CLAUSE = orderBy;
		this.LIMIT_CLAUSE = limit;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = [[this.QUERY.stringify()].concat(
			this.QUERIES.map(q => (q.onDuplicate ? q.onDuplicate.toUpperCase() + ' ' : '') + q.select.stringify())
		).join(' UNION ')];
		if (this.ORDER_BY_CLAUSE) { str.push(this.ORDER_BY_CLAUSE.stringify()); }
		if (this.LIMIT_CLAUSE) { str.push('LIMIT ' + this.LIMIT_CLAUSE.join(',')); }
		return sql.join(' ');
	}
	
	/**
	 * @inheritdoc
	 */
	static async parse(context, expr, parseCallback) {
		let parse = null;
		const paramsRegex = { useRegex: 'i' };
		if (!(parse = Lexer.lex(expr, [' UNION([ ]+(ALL|DISTINCT))? '], paramsRegex)) || !parse.matches.length) return;
		const selects = parse.tokens;
		const clauses = parse.matches;
		let orderBy = null,limit = null;
		// Are the selects parenthisized? Then there could be outer ORDER BY / LIMIT clauses
		if (selects[0].trim().startsWith('(')) {
			const lastStmtSplit = Lexer.lex(selects.pop(), ['ORDER[ ]+BY', 'LIMIT'], paramsRegex);
			selects.push(lastStmtSplit.tokens.shift());
			for (const clause of lastStmtSplit.matches) {
				const _expr = lastStmtSplit.tokens.shift().trim();
				if (clause.toUpperCase().startsWith('ORDER')) {
					orderBy = await parseCallback(context, _expr, [OrderBy]);
				} else if (clause.toUpperCase().startsWith('LIMIT')) {
					limit = _expr.split(',').map(n => parseInt(n));
				}
			}
		}
		return new this(
			await parseCallback(context, selects.shift().trim()),
			await Promise.all(selects.map(async (select, i) => {
				return {
					select: await parseCallback(context, select.trim()),
					onDuplicate: (clauses[i].match(new RegExp('ALL|DISTINCT', 'i')) || [])[0]
				}
			})),
			orderBy,
			limit
		);
	}
}