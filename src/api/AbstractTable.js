
import { _intersect } from '@webqit/util/arr/index.js';
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
    get params() { return Object.assign({}, this.database.params, this.$.params); }
    
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
	 * @param Array 					fields
	 * 
	 * @param Number|Object|Function 	clauses
	 * 
	 * @param Array 					fields
	 * @param Object|Function|Number 	clauses
	 */
	async count(...args) {
		const fields = [].concat(Array.isArray(args[0]) || typeof args[0] === 'string' ? args.shift() : '*');
		if (fields.length !== 1) throw new Error(`Count expects exactly one field.`);
		const result = await this.select([ q => q.fn('COUNT', fields[0]).as('c') ], ...args);
		return !Array.isArray(result)/*for when clauses.where is an ID*/ ? result.c : result[0].c;
	}
	 
	/**
	 * Selects record(s).
	 * 
	 * @param Array 					fields
	 * 
	 * @param Number|Object|Function 	clauses
	 * 
	 * @param Array 					fields
	 * @param Object|Function|Number 	clauses
	 */
	async select(...args) {
		const query = new SelectStatement(this.database.client);
		query.from([this.database.name, this.name]);
		// Where and fields
		const fields = Array.isArray(args[0]) ? args.shift() : ['*'];
		query.select(...fields);
		const clauses = args.shift() || {};
		await this.$applyClauses(query, clauses);
		// Handle
		const result = await this.database.client.query(query);
		if (['string', 'number'].includes(typeof clauses.where)) return result[0];
		return result;
	}

	/**
	 * Inserts record(s).
	 * 
	 * @param Object 					payload
	 * @param Object|Function			clauses
	 * 
	 * @param Array 					multilinePayload
	 * @param Object|Function			clauses
	 * 
	 * @param Array 					columns
	 * @param Array 					multilineValues
	 * @param Object|Function			clauses
	 */
	async insert(...args) {
		const query = new InsertStatement(this.database.client);
		query.into([this.database.name, this.name]);
		const [ columns = [], values = [], clauses ] = await this.$resolvePayload(...args);
		// Payload
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row);
		if (_isObject(clauses) && clauses.returning) {
			query.returning(clauses.returning);
		} else if (_isFunction(clauses)) {
			clauses(query);
		}
		// Handle
		const result = await this.database.client.query(query);
		if (_isObject(args[0]) && clauses?.returning) return result[0];
		return result;
	}
		
	/**
	 * Upserts record(s); with optional custom onConflict clause.
	 * 
	 * @param Object 					payload
	 * @param Object|Function			clauses
	 * 
	 * @param Array 					multilinePayload
	 * @param Object|Function			clauses
	 * 
	 * @param Array 					columns
	 * @param Array 					multilineValues
	 * @param Object|Function			clauses
	 */
	async upsert(...args) {
		const query = new InsertStatement(this.database.client);
		query.into([this.database.name, this.name]);
		const [ columns = [], values = [], clauses ] = await this.$resolvePayload(...args);
		// Payload
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row);
		if (_isObject(clauses) && clauses.returning) {
			query.returning(clauses.returning);
		} else if (_isFunction(clauses)) {
			clauses(query);
		}
		// On-conflict
		query.onConflict({ entries: columns.map((col, i) => [col, values[0][i]]) });
		if (this.params.dialect === 'postgres') {
			const schema = await this.database.describeTable(this.name);
			const uniqueKeys = schema.columns?.filter(col => col.uniqueKey).map(k => [k.name]).concat(schema.constraints?.filter(cons => cons.type === 'UNIQUE').map(k => k.targetColumns));
			if (!uniqueKeys.length) throw new Error(`Table has no unique keys defined. You may want to perform a direct INSERT operation.`);
			const columns = query.columns()?.toJSON().list || [];
			const conflictTarget = uniqueKeys.find(keyComp => _intersect(keyComp, columns).length) || uniqueKeys[0];
			query.onConflict(q => q.target(...conflictTarget));
		}
		// Handle
		const result = await this.database.client.query(query);
		if (_isObject(args[0]) && clauses?.returning) return result[0];
		return result;
	}
	
	/**
	 * Updates record(s).
	 * 
	 * @param Object 					payload
	 * @param Object|Function|Number 	clauses
	 */
	async update(payload, clauses) {
		if (!clauses) throw new Error(`The "clauses" parameter cannot be ommitted.`);
		const query = new UpdateStatement(this.database.client);
		query.table([this.database.name, this.name]);
		for (const [k, v] of Object.entries(payload)) query.set(k, toVal(v, this.params.autoBindings));
		await this.$applyClauses(query, clauses);
		// Handle
		const result = await this.database.client.query(query);
		if (['string', 'number'].includes(typeof clauses.where) && clauses.returning) return result[0];
		return result;
	}
	 
	/**
	 * Deletes record(s).
	 * 
	 * @param Object|Function|Number 	clauses
	 */
	async delete(clauses) {
		if (!clauses) throw new Error(`The "clauses" parameter cannot be ommitted.`);
		const query = new DeleteStatement(this.database.client);
		query.from([this.database.name, this.name]);
		await this.$applyClauses(query, clauses);
		// Handle
		const result = await this.database.client.query(query);
		if (['string', 'number'].includes(typeof clauses.where) && clauses.returning) return result[0];
		return result;
	}
	
	/**
	 * -------------------------------
	 */

	/**
	 * Helps resolve specified where condition for the query.
	 * 
	 * @param Query 						query
	 * @param Object|Function|Number|Bool 	clauses
	 */
	async $applyClauses(query, clauses) {
		if (clauses === true) return;
		if (_isObject(clauses)) {
			const addWheres = wheres => query.where(...Object.entries(wheres).map(([k, v]) => q => q.equals(k, toVal(v, this.params.autoBindings))));
			if (['string', 'number'].includes(typeof clauses.where)) {
				const schema = await this.database.describeTable(this.name);
				const primaryKey = schema.columns?.find(col => col.primaryKey)?.name || schema.constraints?.find(cons => cons.type === 'PRIMARY_KEY')?.targetColumns[0];
				if (!primaryKey) throw new Error(`Cannot resolve primary key name for implied record.`);
				addWheres({ [primaryKey]: clauses.where });
			} else if (_isObject(clauses.where)) addWheres(clauses.where);
			else if (clauses.where) query.where(clauses.where);
			if (clauses.limit) query.limit(clauses.limit);
			if (clauses.returning) query.returning(clauses.returning);
		} else if (_isFunction(clauses)) {
			clauses(query);
		} else if (/^\d+$/.test(clauses)) {
			query.limit(clauses);
		}
	}
		
	/**
	 * Resolves input arguments into columns and values array.
	 * 
	 * @param Object 					payload
	 * @param Object|Function			clauses
	 * 
	 * @param Array 					multilinePayload
	 * @param Object|Function			clauses
	 * 
	 * @param Array 					columns
	 * @param Array 					multilineValues
	 * @param Object|Function			clauses
	 */
	async $resolvePayload(...args) {
		let columns = [], values = [], clauses;
		if (Array.isArray(args[0]) && /*important*/args[0].every(s => typeof s === 'string') && Array.isArray(args[1])) {
			if (!args[1].every(s => Array.isArray(s))) throw new TypeError(`Invalid payload format.`);
			[ columns, values, clauses ] = args.splice(0, 3);
		} else {
			const payload = [].concat(args.shift());
			if (!_isObject(payload[0])) throw new TypeError(`Invalid payload format.`);
			columns = Object.keys(payload[0]);
			values = payload.map(row => Object.values(row));
			clauses = args.shift();
		}
		values = values.map(row => row.map(v => toVal(v, this.params.autoBindings)));
		return [columns, values, clauses];
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