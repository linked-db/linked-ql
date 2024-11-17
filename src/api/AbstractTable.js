import { _isArray, _isFunction, _isObject } from '@webqit/util/js/index.js';
import { _beforeLast, _afterLast } from '@webqit/util/str/index.js';
import { GlobalTableRef } from '../lang/expr/refs/GlobalTableRef.js';
import { InsertStatement } from '../lang/dml/InsertStatement.js';
import { UpsertStatement } from '../lang/dml/UpsertStatement.js';
import { UpdateStatement } from '../lang/dml/UpdateStatement.js';
import { DeleteStatement } from '../lang/dml/DeleteStatement.js';
import { SelectStatement } from '../lang/dql/SelectStatement.js';

export class AbstractTable {

	constructor(database, tblName, params = {}) {
		this.$ = { database, name: tblName, params };
	}

	get database() { return this.$.database; }

	get name() { return this.$.name; }

	get ident() { return GlobalTableRef.fromJSON(this, [this.database.name, this.name]); }

	get params() { return Object.assign({}, this.database.params, this.$.params); }

	async schema() { return (await this.database.schema(this.name))?.table(this.name); }

	async count(...args) {
		const fields = [].concat(Array.isArray(args[0]) || typeof args[0] === 'string' || args.length > 1 ? args.shift() : '*');
		const result = await this.select([{ expr: { count: fields }, as: 'c' }], ...args);
		return !Array.isArray(result)/*for when clauses.where is an ID*/ ? result.c : result[0].c;
	}

	async select(...args) {
		const fields = [].concat(Array.isArray(args[0]) || typeof args[0] === 'string' || args.length > 1 ? args.shift() : '*');
		const clauses = (typeof args[0] !== 'function' && args.shift()) || {};
		const buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
		const singular = ['string', 'number'].includes(typeof clauses.where);
		return this.database.client.withSchema(async () => {
			// Compose JSON
			const table = [this.database.name, this.name];
			const json = await this.resolveWhereClause({ fields, from: [table], ...clauses });
			const query = this.createQuery(json, SelectStatement, 'table.select()');
			buildCallback?.(query);
			console.log('_______::::::::' + query);
			const result = await this.database.client.execQuery(query, { inspect: true });
			if (singular) return result[0];
			return result;
		});
	}

	async insert(...args) {
		let isUpsert, columns = [], valueMatrix = [], clauses, buildCallback, singular = false;
		if (typeof args[0] === 'boolean') isUpsert = args.shift();
		return this.database.client.withSchema(async () => {
			if (Array.isArray(args[0]) && /*important*/args[0].every(s => typeof s === 'string') && Array.isArray(args[1])) {
				if (!args[1].every(s => Array.isArray(s))) throw new TypeError(`Invalid payload format.`);
				[columns, valueMatrix] = args.splice(0, 2);
				clauses = (typeof args[0] !== 'function' && args.shift()) || {};
				buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
			} else {
				const _singular = _isObject(args[0]); // Must come before any args.shift()
				const payload = [].concat(args.shift());
				if (!_isObject(payload[0])) throw new TypeError(`Invalid payload format.`);
				clauses = (typeof args[0] !== 'function' && args.shift()) || {};
				buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
				[columns, valueMatrix] = await this.resolvePayload(payload);
				singular = _singular && clauses.returning;
			}
			// Compose JSON
			const table = [this.database.name, this.name];
			const json = { into: [table], columns, values: valueMatrix, ...clauses };
			const query = this.createQuery(json, isUpsert ? UpsertStatement : InsertStatement, `table.${isUpsert ? 'upsert' : 'insert'}()`);
			buildCallback?.(query);
			const result = await this.database.client.execQuery(query);
			if (singular) return result[0];
			return result;
		});
	}

	async upsert(...args) { return await this.insert(true, ...args); }

	async update(payload, ...args) {
		if (!args.length) throw new Error(`The "clauses" parameter cannot be ommitted.`);
		const clauses = (typeof args[0] !== 'function' && args.shift()) || {};
		const buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
		const singular = ['string', 'number'].includes(typeof clauses.where) && clauses.returning;
		return this.database.client.withSchema(async () => {
			// Compose JSON
			const table = [this.database.name, this.name];
			const [columns, [{ row: values }]] = await this.resolvePayload(payload);
			const json = await this.resolveWhereClause({ table: [table], set: { entries: columns.map((c, i) => ({ operands: [c, values[i]] })) }, ...clauses });
			const query = this.createQuery(json, UpdateStatement, `table.update()`);
			buildCallback?.(query);
			const result = await this.database.client.execQuery(query);
			if (singular) return result[0];
			return result;
		});
	}

	async delete(...args) {
		if (!args.length) throw new Error(`The "clauses" parameter cannot be ommitted.`);
		const clauses = (typeof args[0] !== 'function' && args.shift()) || {};
		const buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
		const singular = ['string', 'number'].includes(typeof clauses.where) && clauses.returning;
		return this.database.client.withSchema(async () => {
			// Compose JSON
			const table = [this.database.name, this.name];
			const json = await this.resolveWhereClause({ from: [table], ...clauses });
			const query = this.createQuery(json, DeleteStatement, `table.delete()`);
			buildCallback?.(query);
			const result = await this.database.client.execQuery(query);
			if (singular) return result[0];
			return result;
		});
	}

	/**
	 * -------------------------------
	 */

	createQuery(json, Class, id) {
		return Class.prototype.$castInputs.call(this.database.client, [json], Class, null, id);
	}

	async resolveWhereClause(clauses) {
		if (['string', 'number'].includes(typeof clauses.where)) {
			const tblSchema = await this.schema();
			const primaryKey = tblSchema.primaryKey()?.columns()[0];
			if (!primaryKey) throw new Error(`Cannot resolve primary key name for implied record.`);
			return { ...clauses, where: { eq: [primaryKey, clauses.where] } };
		}
		return clauses;
	}

	async resolvePayload(payload) {
		const $$payload = [].concat(payload);
		if (!_isObject($$payload[0])) throw new TypeError(`Invalid payload format.`);
		const buildValues = (data, columns) => {
			const values = [];
			for (const column of columns) {
				if (column.rpath) {
					const [key, { columns }] = column.rpath;
					if (!_isObject(data[key])) throw new Error(`Irregular payload structure: expected an object of shape ${JSON.stringify(columns)} but got: ${data[key]}`);
					values.push({ row: buildValues(data[key], columns) });
				} else if (column.lpath) {
					const [key, { columns }] = column.lpath[1].rpath;
					if (!Array.isArray(data[key])) throw new Error(`Irregular payload structure: expected an array of objects of shape ${JSON.stringify(columns)} but got: ${data[key]}`);
					values.push({ values: data[key].map((data) => ({ row: buildValues(data, columns) })) });
				} else {
					values.push(toVal(data[column]));
				}
			}
			return values;
		};
		const valueMatrix = [];
		const columns = await this.buildColumns($$payload[0]);
		for (const data of $$payload) {
			valueMatrix.push({ row: buildValues(data, columns) });
		}
		return [columns, valueMatrix];
	}

	async buildColumns(data) {
		const columns = [];
		const tblSchema = await this.schema();
		if (!tblSchema) throw new Error(`Table ${this.ident} does not exist.`);
		for (const key in data) {
			const colSchema = tblSchema.column(key);
			const fk = colSchema?.foreignKey();
			if (fk && _isObject(data[key])) {
				const targetTable = this.database.client.database(fk.targetTable().prefix(true).name()).table(fk.targetTable().name());
				columns.push({ rpath: [key, { columns: await targetTable.buildColumns(data[key]) }] });
			} else if (!colSchema) {
				if (!Array.isArray(data[key])) throw new Error(`Unknown column: ${key}`);
				const foreignTable = this.database.table(key);
				const fks = (await foreignTable.schema()).foreignKeys().filter((fk) => fk.targetTable().identifiesAs(this.ident));
				if (fks.length !== 1) throw new Error(`${fks.length} correletions found between ${this.ident} and ${foreignTable.ident}`);
				columns.push({ lpath: [fks[0].columns()[0], { rpath: [key, { columns: await foreignTable.buildColumns(data[key][0]) }] }] });
			} else {
				columns.push(key);
			}
		}
		return columns;
	}

	$capture(requestName, requestSource) {
		return this.database.$capture(requestName, requestSource);
	}
}

const toVal = (v) => {
	if (typeof v === 'function') return v;
	if (v instanceof Date) return (q) => q.value(v.toISOString().split('.')[0]);
	if (Array.isArray(v) || _isObject(v)) return (q) => q.json(v);
	if ([null, undefined].includes(v)) return (q) => q.literal(null);
	return (q) => q.value(v);
};