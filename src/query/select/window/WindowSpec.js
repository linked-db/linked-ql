
import { _unwrap } from '@webqit/util/str/index.js';
import Lexer from '../../Lexer.js';
import PartitionByClause from '../PartitionByClause.js';
import OrderByClause from '../OrderByClause.js';
import Node from '../../abstracts/Node.js';

export default class WindowSpec extends Node {
	
	/**
	 * Instance properties
	 */
	NAME;
	WINDOW_REF;
	PARTITION_BY_CLAUSE;
	ORDER_BY_CLAUSE;

	/**
	 * Sets the name.
	 * 
	 * @param String name
	 * 
	 * @returns this
	 */
	name(name) {
		this.NAME = name;
		return this;
	}

	/**
	 * Sets a base window.
	 * 
	 * @param String windowRef
	 * 
	 * @returns this
	 */
	existing(windowRef) {
		this.WINDOW_REF = windowRef;
		return this;
	}

	/**
	 * Sets a base window.
	 * 
	 * @param String windowRef
	 * 
	 * @returns this
	 */
	extends(windowRef) {
		this.WINDOW_REF = windowRef;
		return this;
	}

	/**
	 * Adds a PARTITION BY clause.
	 * 
	 * @param Array orderBys
	 * 
	 * @returns this
	 */
	partitionBy(...partitionBys) {
		if (this.WINDOW_REF) throw new Error(`The PARTITION BY clause is not allowed when inheriting from a base window.`);
		return this.build('PARTITION_BY_CLAUSE', partitionBys, PartitionByClause, 'criterion');
	}

	/**
	 * Adds an ORDER BY clause.
	 * 
	 * @param Array orderBys
	 * 
	 * @returns this
	 */
	orderBy(...orderBys) { return this.build('ORDER_BY_CLAUSE', orderBys, OrderByClause, 'criterion'); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			name: this.NAME, 
			window_ref: this.WINDOW_REF, 
			partition_by_clause: this.PARTITION_BY_CLAUSE?.toJson(),
			order_by_clause: this.ORDER_BY_CLAUSE?.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json === 'string') json = { window_ref: json };
		else if (typeof json?.name !== 'string' && typeof json?.window_ref !== 'string' && !json?.partition_by_clause && !json?.order_by_clause) return;
		const instance = new this(context);
		if (json.name) instance.name(json.name);
		if (json.window_ref) instance.extends(json.window_ref);
		if (json.partition_by_clause) instance.partitionBy(json.partition_by_clause);
		if (json.order_by_clause) instance.orderBy(json.order_by_clause);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = [];
		if (!this.NAME && this.WINDOW_REF && !this.PARTITION_BY_CLAUSE && !this.ORDER_BY_CLAUSE) {
			// It's an "over w" clause
			sql.push(this.WINDOW_REF);
		} else {
			// Might be an "over (definedRef? ...)" clause or a named window "w AS ()"
			// But certainly an enclosure
			if (this.NAME) sql.push(`${ this.NAME } AS `);
			sql.push(`(${ [
				this.WINDOW_REF,
				this.PARTITION_BY_CLAUSE,
				this.ORDER_BY_CLAUSE
			].filter(x => x).join(' ') })`);
		}
		return sql.join('');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const instance = new this(context);
		const parseEnclosure = async enclosure => {
			const { tokens: [ definedRef, ...clauses ], matches: clauseTypes } = Lexer.split(_unwrap(enclosure.trim(), '(', ')'), ['PARTITION\\s+BY', 'ORDER\\s+BY'], { useRegex:'i', preserveDelims: true });
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

	/**
	 * @property String
	 */
	static regex = 'WINDOW|OVER';
}