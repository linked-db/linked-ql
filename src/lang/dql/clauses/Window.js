import { Lexer } from '../../Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import { AbstractNode } from '../../AbstractNode.js';
import { OrderByClause } from './OrderByClause.js';
import { PartitionByClause } from './PartitionByClause.js';

export class Window extends AbstractNode {
	
	#name;
	#windowRef;
	#partitionByClause;
	#orderByClause;

	name(value) {
		if (!arguments.length) return this.#name;
		return (this.#name = value, this);
	}

	existing(value) {
		if (!arguments.length) return this.#windowRef;
		return (this.#windowRef = value, this);
	}

	extends(value) { return this.existing(...arguments); }

	partitionBy(...args) {
		if (!arguments.length) return this.#partitionByClause;
		if (this.#windowRef) throw new Error(`The PARTITION BY clause is not allowed when inheriting from a base window.`);
		this.#partitionByClause = this.$castInputs(args, PartitionByClause, this.#partitionByClause, 'partition_by_clause', 'add');
		return this;
	}

	orderBy(...args) {
		if (!arguments.length) return this.#orderByClause;
		this.#orderByClause = this.$castInputs(args, OrderByClause, this.#orderByClause, 'order_by_clause', 'add');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		if (typeof json === 'string') json = { windowRef: json };
		else if (!(typeof json === 'object' && json) || !['name', 'windowRef', 'partitionByClause', 'orderByClause'].some(k => k in json)) return;
		return super.fromJSON(context, json, (instance) => {
			if (json.name) instance.name(json.name);
			if (json.windowRef) instance.extends(json.windowRef);
			if (json.partitionByClause) instance.partitionBy(json.partitionByClause);
			if (json.orderByClause) instance.orderBy(json.orderByClause);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			...(this.#name || !this.#windowRef ? { name: this.#name } : {}),
			...(this.#windowRef || !this.#name ? { windowRef: this.#windowRef } : {}),
			...(this.#partitionByClause ? { partitionByClause: this.#partitionByClause.jsonfy(options) } : {}),
			...(this.#orderByClause ? { orderByClause: this.#orderByClause.jsonfy(options) } : {}),
			...jsonIn
		});
	}
	
	static parse(context, expr, parseCallback) {
		const instance = new this(context);
		const parseEnclosure = async enclosure => {
			const { tokens: [ definedRef, ...clauses ], matches: clauseTypes } = Lexer.lex(_unwrap(enclosure.trim(), '(', ')'), ['PARTITION\\s+BY', 'ORDER\\s+BY'], { useRegex:'i', preserveDelims: true });
			if (definedRef.trim()) instance.extends(definedRef.trim());
			for (const clauseType of clauseTypes) {
				// PARTITION BY
				if (/PARTITION\s+BY/i.test(clauseType)) {
					instance.partitionBy(parseCallback(instance, clauses.shift().trim(), [PartitionByClause]));
					continue;
				}
				// ORDER BY
				instance.orderBy(parseCallback(instance, clauses.shift().trim(), [OrderByClause]));
			}
		};
		const hasEnclosure = expr.endsWith(')');
		const isNamedWindow = hasEnclosure && !expr.startsWith('(');
		if (isNamedWindow) {
			// WINDOW w AS (PARTITION BY country ORDER BY city ASC, state DESC), u AS (...)
			// NOTICE below the space around "AS", important in view of "city ASC"
			const [ name, enclosure ] = spec.split(new RegExp(' AS ', 'i'));
			instance.name(name.trim());
			parseEnclosure(enclosure);
		} else if (hasEnclosure) {
			parseEnclosure(expr);
		} else {
			// FUNC OVER w
			instance.existing(expr);
		}
		return instance;
	}
	
	stringify() {
		const sql = [];
		if (!this.#name && this.#windowRef && !this.#partitionByClause && !this.#orderByClause) {
			// It's an "over w" clause
			sql.push(this.#windowRef);
		} else {
			// Might be an "over (definedRef? ...)" clause or a named window "w AS ()"
			// But certainly an enclosure
			if (this.#name) sql.push(`${ this.#name } AS `);
			sql.push(`(${ [
				this.#windowRef,
				this.#partitionByClause,
				this.#orderByClause
			].filter(x => x).join(' ') })`);
		}
		return sql.join('');
	}
}