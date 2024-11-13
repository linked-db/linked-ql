import { _isArray, _isFunction, _isObject } from '@webqit/util/js/index.js';
import { _beforeLast, _afterLast } from '@webqit/util/str/index.js';
import { GlobalTableRef } from '../lang/expr/refs/GlobalTableRef.js';
import { InsertStatement } from '../lang/dml/InsertStatement.js';
import { UpsertStatement } from '../lang/dml/UpsertStatement.js';
import { UpdateStatement } from '../lang/dml/UpdateStatement.js';
import { DeleteStatement } from '../lang/dml/DeleteStatement.js';
import { SelectStatement } from '../lang/dql/SelectStatement.js';

export class AbstractTable {

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
	 * @property GlobalTableRef
	 */
	get ident() { return GlobalTableRef.fromJSON(this, [this.database.name, this.name]); }

	/**
	 * @property Object
	 */
	get params() { return Object.assign({}, this.database.params, this.$.params); }

	/**
	 * Returns the table's schema.
	 * 
	 * @returns TableSchema
	 */
	async schema() { return (await this.database.schema(this.name)).table(this.name); }

	/**
	 * Counts records.
	 * 
	 * @param Array 					fields
	 * 
	 * @param Number|Object|Function 	modifiers
	 * 
	 * @param Array 					fields
	 * @param Object|Function|Number 	modifiers
	 */
	async count(...args) {
		const fields = [].concat(Array.isArray(args[0]) ? args.shift() : '*');
		if (fields.length !== 1) throw new Error(`Count expects exactly one field.`);
		const result = await this.select([{ expr: { count: fields }, as: 'c' }], ...args);
		return !Array.isArray(result)/*for when modifiers.where is an ID*/ ? result.c : result[0].c;
	}

	/**
	 * Selects record(s).
	 * 
	 * @param Array 					fields
	 * 
	 * @param Number|Object|Function 	modifiers
	 * 
	 * @param Array 					fields
	 * @param Object|Function|Number 	modifiers
	 */
	async select(...args) {
		const query = new SelectStatement(this.database.client);
		query.from([this.database.name, this.name]);
		// Where and fields
		const fields = Array.isArray(args[0]) ? args.shift() : ['*'];
		const modifiers = { fields, ...(args.shift() || {}) };
		query.fields(...modifiers.fields);
		return await this.#withModifiers(query, modifiers, async () => {
			const result = await this.database.client.execQuery(query);
			if (['string', 'number'].includes(typeof modifiers.where)) return result[0];
			return result;
		});
	}

	/**
	 * Inserts record(s).
	 * 
	 * @param Object 					payload
	 * @param Object|Function			modifiers
	 * 
	 * @param Array 					multilinePayload
	 * @param Object|Function			modifiers
	 * 
	 * @param Array 					columns
	 * @param Array 					valueMatrix
	 * @param Object|Function			modifiers
	 */
	async insert(...args) {
		// ----
		let isUpsert, columns = [], values = [], modifiers, singular;
		if (typeof args[0] === 'boolean') isUpsert = args.shift();
		// Is cilumns specified separately from values?
		if (Array.isArray(args[0]) && /*important*/args[0].every(s => typeof s === 'string') && Array.isArray(args[1])) {
			if (!args[1].every(s => Array.isArray(s))) throw new TypeError(`Invalid payload format.`);
			[columns, values, modifiers] = args.splice(0, 3);
		} else {
			// No. It's a columns/values map
			const _singular = _isObject(args[0]); // Must come before any args.shift()
			const payload = [].concat(args.shift());
			if (!_isObject(payload[0])) throw new TypeError(`Invalid payload format.`);
			columns = Object.keys(payload[0]);
			values = payload.map(row => Object.values(row));
			modifiers = args.shift();
			singular = _singular && modifiers?.returning;
		}
		let preHook, postHook;
		// ----
		const query = new (isUpsert ? UpsertStatement : InsertStatement)(this.database.client);
		query.into([this.database.name, this.name]);
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row.map(v => toVal(v, this.params.autoBindings)));
		if (_isObject(modifiers) && modifiers.returning) {
			query.returning(...[].concat(modifiers.returning));
		} else if (_isFunction(modifiers)) {
			modifiers(query);
		}
		const willNeedStructure = isUpsert && this.params.dialect === 'postgres';
		return await this.database.client.withSchema(willNeedStructure, async () => {
			let result = await this.database.client.execQuery(query);
			if (singular) result = result[0];
			return result;
		});
	}

	/**
	 * Upserts record(s).
	 * 
	 * @param Object 					payload
	 * @param Object|Function			modifiers
	 * 
	 * @param Array 					multilinePayload
	 * @param Object|Function			modifiers
	 * 
	 * @param Array 					columns
	 * @param Array 					valueMatrix
	 * @param Object|Function			modifiers
	 */
	async upsert(...args) { return await this.insert(true, ...args); }

	/**
	 * Updates record(s).
	 * 
	 * @param Object 					payload
	 * @param Object|Function|Number 	modifiers
	 */
	async update(payload, modifiers) {
		if (!modifiers) throw new Error(`The "modifiers" parameter cannot be ommitted.`);
		const singular = ['string', 'number'].includes(typeof modifiers.where) && modifiers.returning;
		const columns = Object.keys(payload), values = Object.values(payload);
		const query = new UpdateStatement(this.database.client);
		query.table([this.database.name, this.name]);
		columns.forEach((col, i) => query.set(col, toVal(values[i], this.params.autoBindings)));
		return await this.#withModifiers(query, modifiers, async () => {
			let result = await this.database.client.execQuery(query);
			if (singular) result = result[0];
			return result;
		});
	}

	/**
	 * Deletes record(s).
	 * 
	 * @param Object|Function|Number 	modifiers
	 */
	async delete(modifiers) {
		if (!modifiers) throw new Error(`The "modifiers" parameter cannot be ommitted.`);
		const query = new DeleteStatement(this.database.client);
		query.from([this.database.name, this.name]);
		return await this.#withModifiers(query, modifiers, async () => {
			let result = await this.database.client.execQuery(query);
			if (['string', 'number'].includes(typeof modifiers.where) && modifiers.returning) result = result[0];
			return result;
		});
	}

	/**
	 * -------------------------------
	 */

	/**
	 * Helps resolve specified where condition for the query.
	 * 
	 * @param Statement 					query
	 * @param Object|Function|Number|Bool 	modifiers
	 * @param Function						callback
	 */
	async #withModifiers(query, modifiers, callback) {
		if (modifiers === true) return await callback();
		if (_isObject(modifiers)) {
			if (modifiers.limit) query.limit(modifiers.limit);
			if (modifiers.returning) query.returning(...[].concat(modifiers.returning));
			if (['string', 'number'].includes(typeof modifiers.where)) {
				// Initialize schema request with potential needs later on in mind
				return await this.database.client.withSchema(async () => {
					const tblSchema = await this.schema();
					query.where(q => q.eq(getPrimaryKeyConstraint(tblSchema), modifiers.where));
					return await callback();
				});
			} else if (_isArray(modifiers.where)) query.where(...[].concat(modifiers.where));
			else if (typeof modifiers.where === 'function') query.where(modifiers.where);
			else if (modifiers.where && modifiers.where !== true) throw new Error(`Invalid "where" format: ${modifiers.where}. An array expected, or and ID value (string|number), or the boolean true.`);
		} else if (_isFunction(modifiers)) {
			modifiers(query);
		} else if (/^\d+$/.test(modifiers)) {
			query.limit(modifiers);
		}
		return await callback();
	}

	/**
	 * A generic method for tracing something up the node tree.
	 * Like a context API.
	 * 
	 * @param String request
	 * @param Array ...args
	 * 
	 * @returns any
	 */
	$capture(requestName, requestSource) {
		return this.database.$capture(requestName, requestSource);
	}
}

const toVal = (v, autoBindings) => {
	if (typeof v === 'function') return v;
	if (v instanceof Date) return q => q.value(v.toISOString().split('.')[0]);
	if (Array.isArray(v) || _isObject(v)) return q => q.json(v);
	if ([null, undefined].includes(v)) return q => q.literal(null);
	return q => q.value(v);
};

const getPrimaryKeyConstraint = schema => {
	const primaryKey = schema.primaryKey()?.columns()[0];
	if (!primaryKey) throw new Error(`Cannot resolve primary key name for implied record.`);
	return primaryKey;
};
