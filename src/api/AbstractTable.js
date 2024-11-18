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
			const result = await this.database.client.execQuery(query);
			if (singular) return result[0];
			return result;
		});
	}

	async insert(...args) {
		let isUpsert, payload, columns = [], valueMatrix = [], clauses, buildCallback, singular = false;
		if (typeof args[0] === 'boolean') isUpsert = args.shift();
		return this.database.client.withSchema(async () => {
			if (Array.isArray(args[0]) && Array.isArray(args[1])) {
				[columns, payload] = args.splice(0, 2);
				valueMatrix = payload.map((values) => ({ row: this.buildValueMatrix(values, columns) }));
				clauses = (typeof args[0] !== 'function' && args.shift()) || {};
				buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
			} else {
				const _singular = _isObject(args[0]); // Must come before any args.shift()
				payload = [].concat(args.shift());
				[columns, valueMatrix] = await this.resolvePayload(payload);
				clauses = (typeof args[0] !== 'function' && args.shift()) || {};
				buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
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
			const json = await this.resolveWhereClause({ table: [table], set: columns.map((c, i) => [c, values[i]]), ...clauses });
			const query = this.createQuery(json, UpdateStatement, `table.update()`);
			buildCallback?.(query);
			const result = await this.database.client.execQuery(query, {inspect: true });
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
		const columns = await this.buildShapePath($$payload[0], true);
		const valueMatrix = $$payload.map((data) => ({ row: this.buildValueMatrix(data, columns, true) }));
		return [columns, valueMatrix];
	}

	async buildShapePath(data, asColumns = false) {
		const columns = [];
		const tblSchema = await this.schema();
		if (!tblSchema) throw new Error(`Table ${this.ident} does not exist.`);
		for (const key in data) {
			const colSchema = tblSchema.column(key);
			const fk = colSchema?.foreignKey();
			const dimensionType = asColumns ? 'columns' : 'fields';
			if (fk && _isObject(data[key])) {
				const targetTable = this.database.client.database(fk.targetTable().prefix(true).name()).table(fk.targetTable().name());
				columns.push({ rpath: [key, { [dimensionType]: await targetTable.buildShapePath(data[key], asColumns) }] });
			} else if (!colSchema) {
				if (!Array.isArray(data[key])) throw new Error(`Unknown column: ${key}`);
				const foreignTable = this.database.table(key);
				const fks = (await foreignTable.schema()).foreignKeys().filter((fk) => fk.targetTable().identifiesAs(this.ident));
				if (fks.length !== 1) throw new Error(`${fks.length} correletions found between ${this.ident} and ${foreignTable.ident}`);
				const dimension = { [dimensionType]: await foreignTable.buildShapePath(data[key][0], asColumns) };
				columns.push({ rpath: [{ lpath: [fks[0].columns()[0], [this.database.name, key]] }, asColumns ? dimension : { expr: dimension }] });
			} else {
				columns.push(key);
			}
		}
		return columns;
	}

	buildValueMatrix(data, columns, asMap = false) {
		if ((asMap && !_isObject(data)) || (!asMap && !Array.isArray(data))) throw new Error(`Irregular payload structure: expected an object of shape ${JSON.stringify(columns)} but got: ${data}`);
		const valueMatrix = [], colsLength = columns.length;
		for (let i = 0; i < colsLength; i ++) {
			const column = columns[i];
			if (column.rpath) {
				const key = column.rpath[0];
				const columns = column.rpath[1].columns || [column.rpath[1]];
				if (key.lpath) {
					const [, [, table]] = key.lpath;
					const values = asMap ? data[table] : data[i];
					if (!Array.isArray(values)) throw new Error(`Irregular payload structure: expected an array of ${table} of shape ${JSON.stringify(columns)} but got: ${values}`);
					valueMatrix.push({ values: values.map((data) => ({ row: this.buildValueMatrix(data, columns, asMap) })) });
				} else {
					const row = asMap ? data[key] : data[i];
					valueMatrix.push({ row: this.buildValueMatrix(row, columns, asMap) });
				}
			} else {
				const value = asMap ? data[column] : data[i];
				valueMatrix.push(toValue(value));
			}
		}
		return valueMatrix;
	}

	$capture(requestName, requestSource) {
		return this.database.$capture(requestName, requestSource);
	}
}

const toValue = (v) => {
	if (typeof v === 'function') return v;
	if (v instanceof Date) return (q) => q.value(v.toISOString().split('.')[0]);
	if (Array.isArray(v) || _isObject(v)) return (q) => q.json(v);
	if ([null, undefined].includes(v)) return (q) => q.literal(null);
	return (q) => q.value(v);
};