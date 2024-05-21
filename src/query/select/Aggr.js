
import Lexer from '../Lexer.js';
import WindowSpec from './window/WindowSpec.js';
import OrderByClause from './OrderByClause.js';
import Func from './Func.js';
		
export default class Aggr extends Func {

	/**
	 * Instance properties
	 */
	ORDER_BY_CLAUSE;
	OVER_CLAUSE;

	/**
	 * @inheritdoc
	 */
	call(...args) { return (super.call(...args), this); }
	
	/**
	 * Adds an OVER clause
	 */
	orderBy(...orderBys) { return (this.build('ORDER_BY_CLAUSE', orderBys, OrderByClause, 'criterion'), this); }

	/**
	 * Adds an OVER clause
	 */
	over(window) {
		// For expressions like SUM OVER ()
		if (!window) window = { name: '' }; // At least an empty string to help pass the WindowSpec.fromJson() validation
		return (this.build('OVER_CLAUSE', [window], WindowSpec), this.OVER_CLAUSE);
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			...super.toJson(), 
			order_by_clause: this.ORDER_BY_CLAUSE?.toJson(),
			over_clause: this.OVER_CLAUSE?.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		const instance = super.fromJson(context, json);
		if (!instance) return;
		if (!this.names.flat().includes(instance.NAME.toUpperCase())) return instance;
		if (json.order_by_clause) instance.orderBy(json.order_by_clause);
		if (json.over_clause) instance.over(json.over_clause);
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = `${ this.NAME.toUpperCase() }(${ [...this.FLAGS, this.ARGS.join(','), this.ORDER_BY_CLAUSE].filter(s => s).join(' ') })`;
		return sql + (this.OVER_CLAUSE ? ` OVER ${ this.OVER_CLAUSE }` : '');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		// Break off any OVER clause, then assert that it's a function
		const [ func, over ] = Lexer.split(expr, ['OVER\\s+'], { useRegex: 'i' }).map(s => s.trim());
		if (!func.endsWith(')') || Lexer.match(func, [' ']).length) return;
		// Match any ALL|DISTINCT flags; also assert that it's an aggr function
		const [ , name, allOrDistinct, args ] = /^(\w+)\((?:(ALL|DISTINCT)\s+)?([\s\S]+)\)$/i.exec(func);
		if (!this.names.flat().includes(name.toUpperCase())) return;
		// Break off any ORDER BY clause, then render
		const [ , $args, orderByClause ] = /^([\s\S]+)(?:\s+(ORDER\s+BY\s+.+))$/i.exec(args) || [ , args ];
		const instance = super.parse(context, `${ name }(${ $args })`, parseCallback);
		if (allOrDistinct) instance.withFlag(allOrDistinct);
		if (orderByClause) instance.orderBy(parseCallback(instance, orderByClause, [OrderByClause]));
		else if (over) instance.over(parseCallback(instance, over, [WindowSpec]));
		return instance;
	}

	static factoryMethods = { call: (context, name, ...args) => this.names.flat().includes(name?.toUpperCase()) && new this(context) };

	static names = [
		[
			'AVG', 
			'BIT_AND', 
			'BIT_OR', 
			'BIT_XOR', 
			'COUNT', 
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