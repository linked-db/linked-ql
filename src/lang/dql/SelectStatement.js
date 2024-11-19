import { Lexer } from '../Lexer.js';
import { AbstractNode } from "../AbstractNode.js";
import { AbstractQueryStatement } from './AbstractQueryStatement.js';
import { AbstractNonDDLStatement } from '../AbstractNonDDLStatement.js';
import { OffsetClause } from './clauses/OffsetClause.js';
import { LimitClause } from './clauses/LimitClause.js';
import { WhereClause } from './clauses/WhereClause.js';
import { JoinClause } from './clauses/JoinClause.js';
import { OrderByClause } from './clauses/OrderByClause.js';
import { GroupByClause } from './clauses/GroupByClause.js';
import { HavingClause } from './clauses/HavingClause.js'
import { WindowClause } from './clauses/WindowClause.js';
import { FieldsSpec } from './clauses/FieldsSpec.js';
import { Table } from './clauses/Table.js';

export class SelectStatement extends AbstractQueryStatement(
	AbstractNonDDLStatement(AbstractNode)
) {
	static get CLAUSE() { return 'SELECT'; }

	#fieldsSpec;
	#fromList = [];
	#groupByClause;
	#havingClause;
	#windowClause;
	#offsetClause;
	#unionClause;

    get statementType() { return 'DQL'; }

	fields(...args) {
		if (!arguments.length) return this.#fieldsSpec;
		this.#fieldsSpec = this.$castInputs(args, FieldsSpec, this.#fieldsSpec, 'fields_list', 'add');
		return this;
	}

	from(...args) {
		if (!arguments.length) return this.#fromList;
		this.#fromList = this.$castInputs(args, Table, this.#fromList, 'from_clause');
		return this;
	}

	tables() { return this.#fromList; }

	groupBy(...args) {
		if (!arguments.length) return this.#groupByClause;
		this.#groupByClause = this.$castInputs(args, GroupByClause, this.#groupByClause, 'group_by_clause', 'add');
		return this;
	}

	having(...args) {
		if (!arguments.length) return this.#havingClause;
		this.#havingClause = this.$castInputs(args, HavingClause, this.#havingClause, 'having_clause', 'add');
		return this;
	}

	window(...args) {
		if (!arguments.length) return this.#windowClause;
		this.#windowClause = this.$castInputs(args, WindowClause, this.#windowClause, 'window_clause', 'add');
		return this;
	}
	
	offset(value) {
		if (!arguments.length) return this.#offsetClause;
		this.#offsetClause = this.$castInputs([value], OffsetClause, this.#offsetClause, 'offset_clause', 'value');
		return this;
	}

	union(...args) {
		if (!arguments.length) return this.#unionClause;
		this.#unionClause = this.$castInputs(args, this.constructor, this.#unionClause, 'union_clause', 'fields');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.fieldsSpec) return;
		return super.fromJSON(context, json, (instance) => {
			instance.fields(...[].concat(json.fieldsSpec));
			if (json.fromList?.length) for (const tbl of json.fromList) instance.from(tbl);
			if (json.groupByClause) instance.groupBy(json.groupByClause);
			if (json.havingClause) instance.having(json.havingClause);
			if (json.windowClause) instance.window(json.windowClause);
			if (json.offsetClause) instance.offset(json.offsetClause);
			if (json.unionClause) instance.union(json.unionClause);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, () => ({
			fieldsSpec: this.#fieldsSpec?.jsonfy(options),
			...(this.#fromList.length ? { fromList: this.#fromList.map((t) => t.jsonfy(options)) } : {}),
			...(this.#groupByClause ? { groupByClause: this.#groupByClause.jsonfy(options) } : {}),
			...(this.#havingClause ? { havingClause: this.#havingClause.jsonfy(options) } : {}),
			...(this.#windowClause ? { windowClause: this.#windowClause.jsonfy(options) } : {}),
			...(this.#offsetClause ? { offsetClause: this.#offsetClause.jsonfy(options) } : {}),
			...(this.#unionClause ? { unionClause: this.#unionClause.jsonfy(options) } : {}),
			...jsonIn
		}));
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, allOrDistinct, body ] = /^SELECT\s+(ALL|DISTINCT)?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context);
		const $body = this.mySubstitutePlaceholders(instance, body.trim());
		// Tokenize
		const clauses = { from: { backtest: '^(?!.*\\s+DISTINCT\\s+$)', test: 'FROM' }, join:JoinClause, where:WhereClause, groupBy:GroupByClause, having:HavingClause, window:WindowClause, orderBy:OrderByClause, limit:LimitClause, offset:OffsetClause, union:'UNION' };
		const [ fieldsSpec, ...tokens ] = Lexer.split($body, Object.values(clauses).map(x => x.REGEX || x.CLAUSE && `${x.CLAUSE}(?!\\w)` || x), { useRegex: 'i', preserveDelims: true });
		// Parse
		instance.fields(parseCallback(instance, fieldsSpec.trim(), [FieldsSpec]));
		main: for (const token of tokens) {
			if (/^FROM/i.test(token)) {
				const tbls = Lexer.split(token.replace(/FROM/i, ''), [',']).map(t => parseCallback(instance, t.trim(), [Table]));
				for (const tbl of tbls) instance.from(tbl);
				continue;
			}
			if (/^UNION/i.test(token)) {
				instance.union(parseCallback(instance, token.replace(/UNION/i, '').trim(), [this]));
				continue;
			}
			if (/^LIMIT.*,(?:\s+)?\d$/i.test(token)) {
				const [ offset, limit ] = token.match(/(\d+)(?:\s+)?,(?:\s+)?(\d+)$/);
				tokens.push(`LIMIT ${ limit }`, `OFFSET ${ offset }`);
				continue;
			}
			for (const verb in clauses) {
				const node = clauses[verb].parse?.(instance, token.trim(), parseCallback);
				if (node) {instance[verb](node); continue main; }
			}
		}
		if (allOrDistinct) instance.withFlag(allOrDistinct);
		return instance;
	}

	stringify() {
		const sql = ['SELECT'];
		if (this.getFlag().length) sql.push(this.getFlag().map(s => s.replace(/_/g, ' ')));
		sql.push(this.#fieldsSpec);
		if (this.#fromList.length) sql.push('FROM', this.#fromList.join(', '));
		sql.push(...this.joins(), this.where(), this.#groupByClause, this.#havingClause, this.#windowClause, this.orderBy(), this.limit(), this.#offsetClause);
		if (this.#unionClause) sql.push(this.#unionClause);
		return sql.filter(s => s).join(' ');
	}
}