import { Lexer } from '../Lexer.js';
import { UpsertStatement } from './UpsertStatement.js';
import { AbstractDMLStatement } from "./AbstractDMLStatement.js";
import { AbstractPayloadStatement } from './AbstractPayloadStatement.js';
import { AbstractQueryStatement } from '../dql/AbstractQueryStatement.js';
import { ReturningClause } from './clauses/ReturningClause.js';
import { SetClause } from './clauses/SetClause.js';
import { JoinClause } from '../dql/clauses/JoinClause.js';
import { WhereClause } from '../dql/clauses/WhereClause.js';
import { LimitClause } from '../dql/clauses/LimitClause.js';
import { Table } from '../dql/clauses/Table.js';

export class UpdateStatement extends AbstractPayloadStatement(
	AbstractQueryStatement(AbstractDMLStatement)
) {
	static get CLAUSE() { return 'UPDATE'; }
	static get DIMENSIONS_TO() { return [UpsertStatement]; }

	#tables = [];
	#postgresFromList = [];

	table(...tables) {
		if (!arguments.length) return this.#tables;
		this.#tables = this.$castInputs(tables, Table, this.#tables, 'table_spec', 'expr');
		return this;
	}

	from(...tables) {
		if (!arguments.length) return this.#postgresFromList;
		this.#postgresFromList = this.$castInputs(tables, Table, this.#postgresFromList, 'from_clause', 'expr');
		return this;
	}

	tables() { return this.#tables.concat(this.#postgresFromList); }

	static fromJSON(context, json, callback = null) {
		if (!Array.isArray(json?.tables)) return;
		return super.fromJSON(context, json, (instance) => {
			instance.table(...json.tables);
			if (json.postgresFromList?.length) instance.from(...json.postgresFromList);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, () => ({
			tables: this.#tables.map(t => t.jsonfy(options)),
			...(this.#postgresFromList.length ? { postgresFromList: this.#postgresFromList.map(t => t.jsonfy(options)) } : {}),
			...jsonIn,
		}));
	}

	static parse(context, expr, parseCallback) {
		const [match, mysqlIgnore, body] = /^UPDATE(?:\s+(IGNORE))?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context);
		const $body = this.mySubstitutePlaceholders(instance, body.trim());
		// Tokenize
		const dialect = context?.params?.dialect || 'postgres';
		const clauses = { ...(dialect === 'postgres' ? { set: SetClause, from: { backtest: '^(?!.*\\s+DISTINCT\\s+$)', test: 'FROM' } } : {}), join: JoinClause, ...(dialect === 'mysql' ? { set: SetClause } : {}), where: WhereClause, ...(dialect === 'mysql' ? { limit: LimitClause } : {}), returning: ReturningClause };
		const [tableSpec, ...tokens] = Lexer.split($body, Object.values(clauses).map(x => x.REGEX || x.CLAUSE || x), { useRegex: 'i', preserveDelims: true });
		// Parse
		instance.table(...Lexer.split(tableSpec, [',']).map(t => parseCallback(instance, t.trim(), [Table])));
		main: for (const token of tokens) {
			if (/^FROM/i.test(token)) {
				instance.from(...Lexer.split(token.replace(/FROM/i, ''), [',']).map(t => parseCallback(instance, t.trim(), [Table])));
				continue;
			}
			for (const verb in clauses) {
				const node = clauses[verb].parse?.(instance, token.trim(), parseCallback);
				if (node) { instance[verb](node); continue main; }
			}
		}
		if (mysqlIgnore) instance.withFlag(mysqlIgnore);
		return instance;
	}

	stringify() {
		const sql = ['UPDATE'];
		sql.push(...this.getFlag().map(s => s.replace(/_/g, ' ')));
		sql.push(this.#tables.join(', '));
		if (this.params.dialect === 'mysql') {
			sql.push(...this.joins(), this.set(), this.where(), this.limit(), /*special support*/this.returning());
		} else {
			sql.push(this.set());
			if (this.#postgresFromList.length) sql.push(`FROM ${this.#postgresFromList.join(', ')}`);
			sql.push(...this.joins(), this.where(), this.returning());
		}
		return sql.filter(s => s).join(' ');
	}
}