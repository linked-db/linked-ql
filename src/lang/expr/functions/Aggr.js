import { Lexer } from '../../Lexer.js';
import { _toCamel } from '@webqit/util/str/index.js';
import { OrderByClause } from '../../dql/clauses/OrderByClause.js';
import { Window } from '../../dql/clauses/Window.js';
import { Fn } from './Fn.js';

export class Aggr extends Fn {

	#overClause;
	#orderByClause;

	over(value) {
		if (!arguments.length) return this.#overClause;
		// For expressions like SUM OVER ()
		if (!value) value = { name: '' }; // At least an empty string to help pass the Window.fromJSON() validation
		this.#overClause = this.$castInputs([value], Window, this.#overClause, 'over_clause');
		return this;
	}
	
	orderBy(...args) {
		if (!arguments.length) return this.#orderByClause;
		this.#orderByClause = this.$castInputs(args, OrderByClause, this.#orderByClause, 'order_by_clause', 'add');
		return this;
	}

	static get expose() {
		return {
			fn: (context, name, ...args) => this.names.flat().includes(name?.toUpperCase()) && this.fromJSON(context, { name, args }),
			...Object.fromEntries(this.names.flat().map(FN => {
				return [ _toCamel(FN.toLowerCase().replace(/_/g, ' ')), (context, ...args) => this.fromJSON(context, { name: FN, args }) ]
			})),
		};
	}

	static fromJSON(context, json, callback = null) {
		if (!this.names.flat().includes(json?.name?.toUpperCase?.())) return;
		if (Object.keys(json || {}).filter((k) => !['nodeName', 'name', 'args', 'orderByClause', 'overClause', 'flags'].includes(k)).length) return;
		return super.fromJSON(context, json, (instance) => {
			if (json.orderByClause) instance.orderBy(json.orderByClause);
			if (json.overClause) instance.over(json.overClause);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			...(this.#orderByClause ? { orderByClause: this.#orderByClause.jsonfy(options) } : {}),
			...(this.#overClause ? { overClause: this.#overClause.jsonfy(options) } : {}),
			...jsonIn
		});
	}
	
	static parse(context, expr, parseCallback) {
		// Break off any OVER clause, then assert that it's a function
		const [ func, overClause ] = Lexer.split(expr, ['OVER\\s*'], { useRegex: 'i' }).map(s => s.trim());
		// Match any ALL|DISTINCT flags; also assert that it's an aggr function
		const [ , name, aggrFlag, args = '' ] = /^(\w+)\((?:\s+)?(?:(ALL|DISTINCT|FILTER)\s+)?([\s\S]+?)?\)$/i.exec(func) || [];
		if (!this.names.flat().includes(name?.toUpperCase())) return;
		// Break off any ORDER BY clause, then render
		const [ , $args, orderByClause ] = /^([\s\S]+)(?:\s+(ORDER\s+BY\s+.+))$/i.exec(args) || [ , args ];
		const instance = super.parse(context, `${ name }(${ $args })`, parseCallback);
		if (aggrFlag) instance.withFlag(aggrFlag.toUpperCase());
		if (orderByClause) instance.orderBy(parseCallback(instance, orderByClause, [OrderByClause]));
		else if (overClause) instance.over(parseCallback(instance, overClause.trim(), [Window]));
		return instance;
	}

	stringify() {
		const sql = `${ this.name().toUpperCase() }(${ [...this.getFlag(), this.args().join(', '), this.#orderByClause].filter(s => s).join(' ') })`;
		return sql + (this.#overClause ? ` OVER ${ this.#overClause }` : '');
	}

	static names = [
		[
			'AVG', 
			'BIT_AND', 
			'BIT_OR', 
			'BIT_XOR', 
			'COUNT', 
			'JSON_AGG',
			'JSON_ARRAYAGG', 
			'JSON_OBJECTAGG', 
			'MAX', 
			'MIN',
			'STDDEV_POP',
			'STDDEV',
			'STD',
			'STDDEV_SAMP',
			'SUM',
			'VAR_POP',
			'VARIANCE',
			'VAR_SAMP',
			// May not apply to OVER()
			'GROUP_CONCAT',
			'GROUP_CONCAT_WS',
		],
		[
			'CUME_DIST', 
			'DENSE_RANK', 
			'FIRST_VALUE', 
			'LAG', 
			'LAST_VALUE', 
			'LEAD', 
			'NTH_VALUE', 
			'NTLE',
			'PERCENT_RANK',
			'RANK',
			'ROW_NUMBER',
		],
		[
			'ANY_VALUE', 
			'COLUMN', 
			'COLUMNS', 
			'GROUPING', 
		]
	];
}