
import { _isFunction, _isObject } from '@webqit/util/js/index.js';
import InsertStatement from '../lang/dml/insert/InsertStatement.js';
import UpdateStatement from '../lang/dml/update/UpdateStatement.js';
import DeleteStatement from '../lang/dml/delete/DeleteStatement.js';
import SelectStatement from '../lang/dml/select/SelectStatement.js';

export default class AbstractTable {
	 
	/**
	 * @constructor
	 */
	constructor(database, tblName, params = {}) {
        this.$ = { database, name: tblName, params };
	}

    /**
     * @property Database
     */
    get database() { return this.$.database; }

    /**
     * @property String
     */
    get name() { return this.$.name; }

    /**
     * @property Object
     */
    get params() { return this.$.params; }
    
	/**
	 * A generic method for tracing something up the node tree.
	 * Like a context API.
	 * 
	 * @param String request
	 * @param Array ...args
     * 
     * @returns any
	 */
	$trace(request, ...args) {
		if (request === 'get:api:table') return this;
		if (request === 'get:table:name') return this.name;
        return this.database.$trace(request, ...args);
	}

	/**
	 * Counts records.
	 * 
	 * @param String expr
	 */
	async count(expr = '*') {
		const result = await this.select([ q => q.fn('COUNT', expr).as('c') ]);
		return (result.rows || result)[0].c;
	}
	 
	/**
	 * Selects record(s).
	 * 
	 * @param Array 					fields
	 * 
	 * @param Number|Object|Function 	where
	 * 
	 * @param Array 					fields
	 * @param Number|Object|Function 	where
	 */
	async select(...args) {
		const query = new SelectStatement(this.database.client);
		// Where and fields
		if (/^\d+$/.test(args[0]) || _isObject(args[0]) || _isFunction(args[0])) {
			await this.$resolveWhere(query, args[0]);
		} else {
			query.select(...(args[0] || ['*']));
			await this.$resolveWhere(query, args[1]);
		}
		// Handle
		query.from([this.database.name, this.name]);
		return await this.database.client.query(query);
	}

	/**
	 * Inserts record(s).
	 * 
	 * @param Object 					keyValsMap
	 * @param Array|String			 	returnList
	 * 
	 * @param Array 					multilineKeyValsMap
	 * @param Array|String			 	returnList
	 * 
	 * @param Array 					columns
	 * @param Array 					multilineValues
	 * @param Array|String			 	returnList
	 */
	async insert(...args) {
		const query = new InsertStatement(this.database.client);
		const [ columns = [], values = [], returnList ] = await this.$resolvePayload(...args);
		// Payload
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row);
		// Handle
		query.into([this.database.name, this.name]);
		if (returnList) query.returning(returnList);
		return await this.database.client.query(query);
	}
		
	/**
	 * Upserts record(s); with optional custom onConflict clause.
	 * 
	 * @param Object 					keyValsMap
	 * @param Array|String			 	returnList
	 * 
	 * @param Array 					multilineKeyValsMap
	 * @param Array|String			 	returnList
	 * 
	 * @param Array 					columns
	 * @param Array 					multilineValues
	 * @param Array|String			 	returnList
	 */
	async upsert(...args) {
		const query = new InsertStatement(this.database.client);
		const [ columns = [], values = [], returnList ] = await this.$resolvePayload(...args);
		// Payload
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row);
		// On-conflict
		query.onConflict({ entries: columns.map((col, i) => [col, values[0][i]]) });
		if (returnList) query.returning(returnList);
		// Handle
		query.into([this.database.name, this.name]);
		return await this.database.client.query(query);
	}
	
	/**
	 * Updates record(s).
	 * 
	 * @param Number|Object|Function 	where
	 * @param Object 					payload
	 * @param Array|String			 	returnList
	 */
	async update(...args) {
		if (args.length < 2) throw new Error(`A "where" match cannot be ommitted.`);
		const query = new UpdateStatement(this.database.client);
		query.table([this.database.name, this.name]);
		// Where and payload
		const { where, payload, returnList } = args;
		await this.$resolveWhere(query, where);
		for (const [k, v] of Object.entries(payload)) query.set(k, toVal(v, this.params.autoBindings));
		if (returnList) query.returning(returnList);
		// Handle
		return await this.database.client.query(query);
	}
	 
	/**
	 * Deletes record(s).
	 * 
	 * @param Number|Object|Function 	where
	 * @param Array|String			 	returnList
	 */
	async delete(where, returnList = null) {
		if (!where) throw new Error(`A "where" match cannot be ommitted.`);
		const query = new DeleteStatement(this.database.client);
		query.from([this.database.name, this.name]);
		// Where
		await this.$resolveWhere(query, where);
		if (returnList) query.returning(returnList);
		// Handle
		return await this.database.client.query(query);
	}
	
	/**
	 * -------------------------------
	 */

	/**
	 * Helps resolve specified where condition for the query.
	 * 
	 * @param Query 						query
	 * @param Number|Bool|Object|Function 	where
	 */
	async $resolveWhere(query, where) {
		if (where === true) return;
		if (/^\d+$/.test(where)) {
			const schema = await this.database.describeTable(this.name);
			const primaryKey = schema.columns?.find(col => col.primaryKey)?.name || schema.constraints?.find(cons => cons.type === 'PRIMARY_KEY')?.targetColumns[0];
			if (!primaryKey) throw new Error(`Cannot resolve primary key name for implied record.`);
			where = { [primaryKey]: where };
		}
		if (_isObject(where)) {
			query.where(...Object.entries(where).map(([k, v]) => q => q.equals(k, toVal(v, this.params.autoBindings))));
		} else if (where) query.where(where);
	}
		
	/**
	 * Resolves input arguments into columns and values array.
	 * 
	 * @param Object 					keyValsMap
	 * @param Array|String			 	returnList
	 * 
	 * @param Array 					multilineKeyValsMap
	 * @param Array|String			 	returnList
	 * 
	 * @param Array 					columns
	 * @param Array 					multilineValues
	 * @param Array|String			 	returnList
	 */
	async $resolvePayload(...args) {
		let columns = [], values = [], returnList;
		if (Array.isArray(args[0]) && /*important*/args[0].every(s => typeof s === 'string') && Array.isArray(args[1])) {
			if (!args[1].every(s => Array.isArray(s))) throw new TypeError(`Invalid payload format.`);
			[ columns, values, returnList ] = args.splice(0, 3);
		} else {
			const payload = [].concat(args.shift());
			if (!_isObject(payload[0])) throw new TypeError(`Invalid payload format.`);
			columns = Object.keys(payload[0]);
			values = payload.map(row => Object.values(row));
			returnList = args.shift();
		}
		values = values.map(row => row.map(v => toVal(v, this.params.autoBindings)));
		return [columns, values, returnList];
	}
}

const toVal = (v, autoBindings) => {
	if (v instanceof Date) return q => q.value(v.toISOString().split('.')[0]);
	if (autoBindings !== false) return q => q.$bind(0, v);
	if ([true,false,null].includes(v)) return q => q.literal(v);
	if (Array.isArray(v)) return q => q.array(v);
	if (_isObject(v)) return q => q.object(v);
	return q => q.value(v);
};