import { Lexer } from '../Lexer.js';
import { AbstractDMLStatement } from "./AbstractDMLStatement.js";
import { AbstractQueryStatement } from '../dql/AbstractQueryStatement.js';
import { ReturningClause } from './clauses/ReturningClause.js';
import { LimitClause } from '../dql/clauses/LimitClause.js';
import { WhereClause } from '../dql/clauses/WhereClause.js';
import { JoinClause } from '../dql/clauses/JoinClause.js';
import { OrderByClause } from '../dql/clauses/OrderByClause.js';
import { Table } from '../dql/clauses/Table.js';
import { Identifier } from '../expr/Identifier.js';

export class DeleteStatement extends AbstractQueryStatement(AbstractDMLStatement) {
	static get CLAUSE() { return 'DELETE'; }
	 
	#mysqlDeleteList = [];
	#table;
	#postgresUsingList = [];

	delete(...tables) {
		if (!arguments.length) return this.#mysqlDeleteList;
		this.#mysqlDeleteList = this.$castInputs(tables, Identifier, this.#mysqlDeleteList, 'delete_list');
		return this;
	}

	from(table) {
		if (!arguments.length) return this.#table;
		this.#table = this.$castInputs([table], Table, this.#table, 'from_clause', 'expr');
		return this;
	}

	using(...tables) {
		if (!arguments.length) return this.#postgresUsingList;
		this.#postgresUsingList = this.$castInputs(tables, Table, this.#postgresUsingList, 'using_clause', 'expr');
		return this;
	}

	tables() {
		const tables = this.#table && [this.#table] || [];
		if (this.#table && this.#postgresUsingList.length) {
			// DELETE FROM table1 AS t1 USING table1 -> same
			// DELETE FROM table1 USING table1 AS t1 -> same
			// DELETE FROM table1 AS t1 USING table1 AS t11 -> not same
			tables.push(...this.#postgresUsingList.filter(t => !t.expr().identifiesAs(this.#table.expr().name()) || (t.alias() && this.#table.alias() && !this.$eq(t.alias(), this.#table.alias(), 'ci'))))
		}
		return tables;
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.table) return;
		return super.fromJSON(context, json, (instance) => {
			if (json.mysqlDeleteList?.length) instance.delete(...json.mysqlDeleteList);
			instance.from(json.table);
			if (json.postgresUsingList?.length) instance.using(...json.postgresUsingList);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, () => ({
			...(this.#mysqlDeleteList.length ? { mysqlDeleteList: this.#mysqlDeleteList.map(t => t.jsonfy(options)) } : {}),
			table: this.#table?.jsonfy(options),
			...(this.#postgresUsingList.length ? { postgresUsingList: this.#postgresUsingList.map(t => t.jsonfy(options)) } : {}),
			...jsonIn
		}));
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, mysqlIgnore, body ] = /^DELETE(?:\s+(IGNORE))?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context);
		const $body = this.mySubstitutePlaceholders(instance, body.trim());
		// Tokenize
		const dialect = context?.params?.dialect || 'postgres';
		const clauses = { from: { backtest: '^(?!.*\\s+DISTINCT\\s+$)', test: 'FROM' }, ...(dialect === 'postgres' ? { using: { backtest: '^(?!.*\\s+JOIN\\s+)', test: 'USING' } } : {}), ...(dialect === 'mysql' ? { join:JoinClause } : {}), where:WhereClause, ...(dialect === 'mysql' ? { orderBy:OrderByClause } : {}), limit:LimitClause, returning:ReturningClause };
		const [ mysqlDeleteList = '', ...tokens ] = Lexer.split($body, Object.values(clauses).map(x => x.REGEX || x.CLAUSE || x), { useRegex: 'i', preserveDelims: true });
		// Parse
		if (mysqlDeleteList.trim()) instance.delete(...Lexer.split(mysqlDeleteList, [',']).map(t => parseCallback(instance, t.trim(), [Identifier])));
		main: for (const token of tokens) {
			if (/^FROM/i.test(token)) {
				instance.from(parseCallback(instance, token.replace(/FROM/i, '').trim(), [Table]));
				continue;
			}
			if (/^USING/i.test(token)) {
				instance.using(...Lexer.split(token.replace(/USING/i, ''), [',']).map(t => parseCallback(instance, t.trim(), [Table])));
				continue;
			}
			for (const verb in clauses) {
				const node = clauses[verb].parse?.(instance, token.trim(), parseCallback);
				if (node) {instance[verb](node); continue main; }
			}
		}
		if (mysqlIgnore) instance.withFlag(mysqlIgnore);
		return instance;
	}
	
	stringify() {
		const sql = ['DELETE'];
		sql.push(...this.getFlag().map(s => s.replace(/_/g, ' ')));
		if (this.params.dialect === 'mysql') {
			sql.push(this.#mysqlDeleteList.join(', '));
			sql.push(`FROM ${ this.#table }`);
			sql.push(...this.joins(), this.where(), this.orderBy(), this.limit(), /*special support*/this.returning());
		} else {
			sql.push(`FROM ${ this.#table }`);
			if (this.#postgresUsingList.length) sql.push(`USING ${ this.#postgresUsingList.join(', ') }`);
			sql.push(this.where(), this.limit(), this.returning());
		}
		return sql.filter(s => s).join(' ');
	}
}