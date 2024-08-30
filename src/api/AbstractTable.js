
import { _intersect } from '@webqit/util/arr/index.js';
import { _isFunction, _isObject } from '@webqit/util/js/index.js';
import { _beforeLast, _afterLast } from '@webqit/util/str/index.js';
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
		query.from([this.database.name, this.name]);
		const schemaMemo = this.$schemaMemo();
		// Where and fields
		const fields = Array.isArray(args[0]) ? args.shift() : ['*'];
		query.select(...fields);
		const modifiers = args.shift() || {};
		await this.$applyModifiers(query, modifiers, schemaMemo);
		// Handle
		const result = await this.database.client.query(query);
		if (['string', 'number'].includes(typeof modifiers.where)) return result[0];
		return result;
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
		const query = new InsertStatement(this.database.client);
		query.into([this.database.name, this.name]);
		const schemaMemo = this.$schemaMemo();
		const { columns = [], values = [], modifiers, singular, preHook, postHook } = await this.$resolveInsert(args, schemaMemo, 'insert');
		if (preHook) await preHook();
		// Payload
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row);
		if (_isObject(modifiers) && modifiers.returning) {
			query.returning(...[].concat(modifiers.returning));
		} else if (_isFunction(modifiers)) {
			modifiers(query);
		}
		// Handle
		let result = await this.database.client.query(query);
		if (postHook) result = await postHook(result);
		if (singular) result = result[0];
		return result;
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
		const query = new InsertStatement(this.database.client);
		query.into([this.database.name, this.name]);
		const schemaMemo = this.$schemaMemo();
		const { columns = [], values = [], modifiers, singular, preHook, postHook } = await this.$resolveInsert(args, schemaMemo, 'upsert');
		if (preHook) await preHook();
		// Payload
		if (columns.length) query.columns(...columns);
		for (const row of values) query.values(...row);
		if (_isObject(modifiers) && modifiers.returning) {
			query.returning(...[].concat(modifiers.returning));
		} else if (_isFunction(modifiers)) {
			modifiers(query);
		}
		// On-conflict
		query.onConflict({ entries: columns.map((col, i) => [col, values[0][i]]) });
		if (this.params.dialect === 'postgres') {
			const schema = await schemaMemo.get();
			const uniqueKeys = schema.columns?.filter(col => col.uniqueKey).map(k => [k.name]).concat(schema.constraints?.filter(cons => cons.type === 'UNIQUE').map(k => k.targetColumns));
			if (!uniqueKeys.length) throw new Error(`Table has no unique keys defined. You may want to perform a direct INSERT operation.`);
			const columns = query.columns()?.toJSON().list || [];
			const conflictTarget = uniqueKeys.find(keyComp => _intersect(keyComp, columns).length) || uniqueKeys[0];
			query.onConflict(q => q.target(...conflictTarget));
		}
		// Handle
		let result = await this.database.client.query(query);
		if (postHook) result = await postHook(result);
		if (singular) result = result[0];
		return result;
	}
	
	/**
	 * Updates record(s).
	 * 
	 * @param Object 					payload
	 * @param Object|Function|Number 	modifiers
	 */
	async update(payload, modifiers) {
		if (!modifiers) throw new Error(`The "modifiers" parameter cannot be ommitted.`);
		const singular = ['string', 'number'].includes(typeof modifiers.where) && modifiers.returning;
		const query = new UpdateStatement(this.database.client);
		query.table([this.database.name, this.name]);
		const schemaMemo = this.$schemaMemo();
		// Resolve payload
		let columns = Object.keys(payload),
			values = Object.values(payload),
			preHook, postHook;
		if (columns.length && modifiers.experimentalRecursive) {
			({ columns, values, modifiers, preHook, postHook } = await this.$resolveRelations(columns, values, modifiers, schemaMemo, 'update'));
		} else values = values.map(val => toVal(val, this.params.autoBindings));
		if (preHook) await preHook();
		// Apply to query
		columns.forEach((col, i) => query.set(col, values[i]));
		await this.$applyModifiers(query, modifiers, schemaMemo);
		// Handle
		let result = await this.database.client.query(query);
		if (postHook) result = await postHook(result);
		if (singular) result = result[0];
		return result;
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
		const schemaMemo = this.$schemaMemo();
		await this.$applyModifiers(query, modifiers, schemaMemo);
		// Handle
		let result = await this.database.client.query(query);
		if (['string', 'number'].includes(typeof modifiers.where) && modifiers.returning) result = result[0];
		return result;
	}
	
	/**
	 * -------------------------------
	 */

	/**
	 * Returns an object that memoizes schema retreival
	 */
	$schemaMemo() {
		return {
			db: this.database,
			name: this.name,
			async get() { return this.memo || (this.memo = await this.db.describeTable(this.name)); },
		};
	}
		
	/**
	 * Resolves input arguments into columns and values array.
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
	 * ---------
	 * @param Object 					schemaMemo 
	 * @param String 					action 
	 */
	async $resolveInsert(args, schemaMemo, action) {
		let columns = [], values = [], modifiers, singular;
		// Is cilumns specified separately from values?
		if (Array.isArray(args[0]) && /*important*/args[0].every(s => typeof s === 'string') && Array.isArray(args[1])) {
			if (!args[1].every(s => Array.isArray(s))) throw new TypeError(`Invalid payload format.`);
			[ columns, values, modifiers ] = args.splice(0, 3);
		} else {
			// No. It's a columns/values map
			const _singular = _isObject(args[0]); // Must come before args.shift()
			const payload = [].concat(args.shift());
			if (!_isObject(payload[0])) throw new TypeError(`Invalid payload format.`);
			columns = Object.keys(payload[0]);
			values = payload.map(row => Object.values(row));
			modifiers = args.shift();
			singular = _singular && modifiers?.returning;
		}
		if (columns.length && modifiers?.experimentalRecursive) {
			return { ...(await this.$resolveRelations(columns, values, modifiers || {}, schemaMemo, action)), singular };
		}
		values = values.map(row => row.map(v => toVal(v, this.params.autoBindings)));
		return { columns, values, modifiers, singular };
	}

	/**
	 * Filter out relations
	 * 
	 * @param Array columns 
	 * @param Array values 
	 * @param Object modifiers 
	 * @param Object schemaMemo 
	 * @param String action 
	 * 
	 * @returns Object
	 */
	async $resolveRelations(columns, values, modifiers, schemaMemo, action) {
		const schema = await schemaMemo.get();
		const lhsTablePK = getPrimaryKey(schema);
		const originalReturning = modifiers.returning;
		const columnsDef = Object.fromEntries(schema.columns.map(c => [c.name, c]));
		const relations = { dependencies: new Map, dependents: new Map };
		// Resolve nested rows
		values = values.map((row, rowOffset) => row.reduce((row, val, colOffset) => {
			const lhsTableFK = columns[colOffset];
			if (columnsDef[lhsTableFK]?.references && _isObject(val)) {
				const rhsTableName = columnsDef[lhsTableFK].references.rhsTable;
				const rhsTablePK = columnsDef[lhsTableFK].references.targetColumns[0];
				if (!relations.dependencies.has(rhsTableName)) relations.dependencies.set(rhsTableName, new Map);
				relations.dependencies.get(rhsTableName).set([rowOffset, lhsTableFK, rhsTablePK], val);
				return row.concat(undefined);
			}
			if (lhsTableFK.includes(':') && !columnsDef[lhsTableFK] && Array.isArray(val)) {
				const [ rhsTableName, rhsTableFK ] = [ _beforeLast(lhsTableFK, ':'), _afterLast(lhsTableFK, ':') ];
				if (!relations.dependents.has(rhsTableName)) relations.dependents.set(rhsTableName, new Map);
				relations.dependents.get(rhsTableName).set([rowOffset, lhsTablePK, rhsTableFK], val);
				return row;
			}
			if (!columnsDef[lhsTableFK]) throw new Error(`Unknown column name "${ lhsTableFK }"`);
			return row.concat([toVal(val, this.params.autoBindings)]);
		}, []));
		// Filter out columns that were dependents
		columns = columns.filter(lhsColumn => !(lhsColumn.includes(':') && relations.dependents.has(_beforeLast(lhsColumn, ':'))));
		// Hook for dependencies
		const preHook = async () => {
			for (const [ rhsTableName, catalog ] of relations.dependencies) {
				const catalogStructure = [...catalog.keys()];
				const rhsPayload = [...catalog.values()];
				const rhsReturns = await this.database.table(rhsTableName)[action](rhsPayload, { experimentalRecursive: true, returning: catalogStructure[0][2] });
				catalogStructure.forEach(([ rowOffset, lhsTableFK, rhsTablePK ], i) => {
					values[rowOffset][lhsTableFK] = rhsReturns[i][rhsTablePK];
				});
			}
		};
		// Hook for dependents
		const postHook = async lhsReturns => {
			for (const [ rhsTableName, catalog ] of relations.dependents) {
				const catalogStructure = [...catalog.keys()];
				const rhsPayloadMap = [...catalog.values()];
				const rhsPayload = [];
				catalogStructure.forEach(([ rowOffset, lhsTablePK, rhsTableFK ], i) => {
					if (originalReturning) {
						const payloadOffsetStart = rhsPayload.length, payloadOffsetLen = rhsPayloadMap[i].length;
						lhsReturns[rowOffset][`${ rhsTableName }:${ rhsTableFK }`] = rhsReturns => rhsReturns.slice(payloadOffsetStart, payloadOffsetStart + payloadOffsetLen);
					}
					rhsPayloadMap[i].forEach(row => {
						row[rhsTableFK] = lhsReturns[rowOffset][lhsTablePK];
						rhsPayload.push(row);
					});
				});
				const rhsReturns = await this.database.table(rhsTableName)[action](rhsPayload, { experimentalRecursive: true, returning: originalReturning && '*' });
				if (originalReturning) {
					lhsReturns.forEach(row => Object.keys(row).forEach(key => {
						if (typeof row[key] === 'function') row[key] = row[key](rhsReturns);
					}));
				}
			}
			if (!originalReturning) return lhsReturns.length;
			if (![].concat(originalReturning).includes(lhsTablePK)) {
				lhsReturns = lhsReturns.map(row => { const { [lhsTablePK]: _, ...$row } = row; return $row; });
			}
			return lhsReturns;
		};
		// Our result
		if (relations.dependents.size && ![].concat(modifiers.returning || []).includes(lhsTablePK)) {
			modifiers = { ...modifiers, returning: [].concat(modifiers.returning || []).concat(lhsTablePK) };
		}
		return { columns, values, modifiers, preHook, postHook };
	}

	/**
	 * Helps resolve specified where condition for the query.
	 * 
	 * @param Query 						query
	 * @param Object|Function|Number|Bool 	modifiers
	 * @param Object 						schemaMemo
	 */
	async $applyModifiers(query, modifiers, schemaMemo) {
		if (modifiers === true) return;
		if (_isObject(modifiers)) {
			const addWheres = wheres => query.where(...Object.entries(wheres).map(([k, v]) => q => q.equals(k, toVal(v, this.params.autoBindings))));
			if (['string', 'number'].includes(typeof modifiers.where)) {
				const schema = await schemaMemo.get();
				addWheres({ [getPrimaryKey(schema)]: modifiers.where });
			} else if (_isObject(modifiers.where)) addWheres(modifiers.where);
			else if (modifiers.where && modifiers.where !== true) query.where(modifiers.where);
			if (modifiers.limit) query.limit(modifiers.limit);
			if (modifiers.returning) query.returning(...[].concat(modifiers.returning));
		} else if (_isFunction(modifiers)) {
			modifiers(query);
		} else if (/^\d+$/.test(modifiers)) {
			query.limit(modifiers);
		}
	}
}

const getPrimaryKey = schema => {
	const primaryKey = schema.columns?.find(col => col.primaryKey)?.name || schema.constraints?.find(cons => cons.type === 'PRIMARY_KEY')?.targetColumns[0];
	if (!primaryKey) throw new Error(`Cannot resolve primary key name for implied record.`);
	return primaryKey;
};
const toVal = (v, autoBindings) => {
	if (v instanceof Date) return q => q.value(v.toISOString().split('.')[0]);
	if (autoBindings !== false) return q => q.$bind(0, v);
	if ([true,false,null].includes(v)) return q => q.literal(v);
	if (Array.isArray(v)) return q => q.array(v);
	if (_isObject(v)) return q => q.object(v);
	return q => q.value(v);
};