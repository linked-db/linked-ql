import { _intersect } from '@webqit/util/arr/index.js';
import { _isFunction, _isObject } from '@webqit/util/js/index.js';
import { _beforeLast, _afterLast } from '@webqit/util/str/index.js';
import InsertStatement from '../lang/dml/insert/InsertStatement.js';
import UpdateStatement from '../lang/dml/update/UpdateStatement.js';
import DeleteStatement from '../lang/dml/delete/DeleteStatement.js';
import SelectStatement from '../lang/dml/select/SelectStatement.js';
import Identifier from '../lang/components/Identifier.js';

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
     * @property Identifier
     */
	get ident() { return Identifier.fromJSON(this, [this.database.name, this.name]); }

    /**
     * @property Object
     */
    get params() { return Object.assign({}, this.database.params, this.$.params); }

	/**
	 * Performs any initialization work.
     */
	async $init() { await this.database.$init(); }

    /**
	 * Returns the table's current savepoint.
	 * 
	 * @returns Object
     */
    async savepoint() { await this.$init(); /* TODO */ }

    /**
	 * Returns the table's schema.
	 * 
	 * @returns TableSchema
     */
    async structure() { return (await this.database.structure(this.name)).table(this.name); }

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
		const result = await this.select([ q => q.fn('COUNT', fields[0]).as('c') ], ...args);
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
		query.from(this.ident.toJSON());
		// Where and fields
		const fields = Array.isArray(args[0]) ? args.shift() : ['*'];
		const modifiers = { fields, ...(args.shift() || {})};
		query.select(...modifiers.fields);
		return await this.$applyModifiers(query, modifiers, async () => {
			const result = await this.database.client.query(query);
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
	 * @param Array 					multilineValues
	 * @param Object|Function			modifiers
	 */
	async insert(...args) {
		// ----
		let upsertCallback, columns = [], values = [], modifiers, singular;
		if (typeof args[0] === 'function') upsertCallback = args.shift();
		// Is cilumns specified separately from values?
		if (Array.isArray(args[0]) && /*important*/args[0].every(s => typeof s === 'string') && Array.isArray(args[1])) {
			if (!args[1].every(s => Array.isArray(s))) throw new TypeError(`Invalid payload format.`);
			[ columns, values, modifiers ] = args.splice(0, 3);
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
		const query = new InsertStatement(this.database.client);
		query.into(this.ident.toJSON());
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row.map(v => toVal(v, this.params.autoBindings)));
		if (_isObject(modifiers) && modifiers.returning) {
			query.returning(...[].concat(modifiers.returning));
		} else if (_isFunction(modifiers)) {
			modifiers(query);
		}
		const willNeedStructure = upsertCallback && this.params.dialect === 'postgres';
		return await this.database.client.structure(willNeedStructure && { depth: 2, inSearchPathOrder: true }, async () => {
			if (upsertCallback) await upsertCallback(query);
			let result = await this.database.client.query(query);
			if (singular) result = result[0];
			return result;
		});
	}
		
	/**
	 * Upserts record(s); with optional custom onConflict clause.
	 * 
	 * @param Object 					payload
	 * @param Object|Function			modifiers
	 * 
	 * @param Array 					multilinePayload
	 * @param Object|Function			modifiers
	 * 
	 * @param Array 					columns
	 * @param Array 					multilineValues
	 * @param Object|Function			modifiers
	 */
	async upsert(...args) {
		return await this.insert(async query => {
			const columns = (query.columns()?.entries() || []).map(c => c.name());
			const refFn = this.params.dialect === 'postgres' ? col => q => q.expr(['EXCLUDED', col]) : col => q => q.fn('VALUES', col);
			query.onConflict(...columns.map(col => [col, refFn(col)]));
			if (this.params.dialect === 'postgres') {
				const tblSchema = await this.structure();
				const uniqueKeys = tblSchema.uniqueKeys().map(uk => uk.columns());
				if (!uniqueKeys.length) throw new Error(`Table has no unique keys defined. You may want to perform a direct INSERT operation.`);
				const conflictTarget = uniqueKeys.find(keyComp => _intersect(keyComp, columns).length) || uniqueKeys[0];
				query.onConflict().target(...conflictTarget);
			}
		}, ...args);
	}
	
	/**
	 * Updates record(s).
	 * 
	 * @param Object 					payload
	 * @param Object|Function|Number 	modifiers
	 */
	async update(payload, modifiers) {
		// ----
		if (!modifiers) throw new Error(`The "modifiers" parameter cannot be ommitted.`);
		const singular = ['string', 'number'].includes(typeof modifiers.where) && modifiers.returning;
		let columns = Object.keys(payload),
			values = Object.values(payload),
			preHook, postHook;
		// ----
		const query = new UpdateStatement(this.database.client);
		query.table(this.ident.toJSON());
		columns.forEach((col, i) => query.set(col, toVal(values[i], this.params.autoBindings)));
		return await this.$applyModifiers(query, modifiers, async () => {
			let result = await this.database.client.query(query);
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
		query.from(this.ident.toJSON());
		return await this.$applyModifiers(query, modifiers, async () => {
			let result = await this.database.client.query(query);
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
	async $applyModifiers(query, modifiers, callback) {
		if (modifiers === true) return await callback();
		const addWheres = wheres => query.where(...Object.entries(wheres).map(([k, v]) => {
			if (v === null) return q => q.isNull(k);
			return q => q.equals(k, toVal(v, this.params.autoBindings));
		}));
		if (_isObject(modifiers)) {
			if (modifiers.limit) query.limit(modifiers.limit);
			if (modifiers.returning) query.returning(...[].concat(modifiers.returning));
			if (['string', 'number'].includes(typeof modifiers.where)) {
				// Initialize structure request with potential needs later on in mind
				return await this.database.client.structure({ depth: 2, inSearchPathOrder: true }, async () => {
					const tblSchema = await this.structure();
					addWheres({ [ getPrimaryKey(tblSchema) ]: modifiers.where });
					return await callback();
				});
			}
			if (_isObject(modifiers.where)) addWheres(modifiers.where);
			else if (modifiers.where && modifiers.where !== true) query.where(modifiers.where);
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
	$trace(request, ...args) {
		if (request === 'get:TABLE_API') return this;
		if (request === 'get:TABLE_NAME') return this.name;
        return this.database.$trace(request, ...args);
	}
}

const toVal = (v, autoBindings) => {
	if (typeof v === 'function') return v;
	if (v instanceof Date) return q => q.value(v.toISOString().split('.')[0]);
	if (Array.isArray(v) || _isObject(v)) return q => q.json(v);
	if ([true,false,null,undefined].includes(v)) return q => q.literal(v === undefined ? null : v);
	return q => q.value(v);
};

const getPrimaryKey = schema => {
	const primaryKey = schema.primaryKey()?.columns()[0];
	if (!primaryKey) throw new Error(`Cannot resolve primary key name for implied record.`);
	return primaryKey;
};
