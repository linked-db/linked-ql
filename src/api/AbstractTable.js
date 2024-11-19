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

	async count(expr, clauses = {}) {
		const result = await this.select({ ...clauses, shorthands: false, fields: [{ expr: { count: [expr] }, as: 'c' }] });
		return !Array.isArray(result)/*for when clauses.where is an ID*/ ? result.c : result[0].c;
	}

	async select(...args) {
		const clauses = (typeof args[0] !== 'function' && args.shift()) || {};
		const buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
		const singular = ['string', 'number'].includes(typeof clauses.where);
		return this.database.client.withSchema(async () => {
			const { shorthands: __, ...$clauses } = { fields: '*', ...clauses, from: [[this.database.name, this.name]] };
			if (clauses.shorthands) {
				$clauses.fields = await this.buildShapePath($clauses.fields, 'fields');
			}
			const json = await this.resolveWhereClause($clauses);
			const query = this.createQuery(json, SelectStatement, 'table.select()');
			buildCallback?.(query);
			const result = await this.database.client.execQuery(query);
			if (singular) return result[0];
			return result;
		});
	}

	async insert(...args) {
		let isUpsert, singular = false;
		if (typeof args[0] === 'boolean') isUpsert = args.shift();
		const clauses = (typeof args[0] !== 'function' && {...args.shift()}) || {};
		const buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
		return this.database.client.withSchema(async () => {
			if (clauses.columns) {
				if (clauses.shorthands) {
					clauses.columns = await this.buildShapePath(clauses.columns, 'columns');
				}
				clauses.values = clauses.values.map((row) => ({ row: this.buildValueMatrix(row, clauses.columns, 'value-matrix') }));
			} else if (clauses.data) {
				singular = _isObject(clauses.data) && clauses.returning;
				[clauses.columns, clauses.values] = await this.resolvePayload([].concat(clauses.data), 'payload');
			}
			const { data: _, shorthands: __, ...$clauses } = { ...clauses, into: [[this.database.name, this.name]] };
			const query = this.createQuery($clauses, isUpsert ? UpsertStatement : InsertStatement, `table.${isUpsert ? 'upsert' : 'insert'}()`);
			buildCallback?.(query);
			const result = await this.database.client.execQuery(query);
			if (singular) return result[0];
			return result;
		});
	}

	async upsert(...args) { return await this.insert(true, ...args); }

	async update(...args) {
		const clauses = (typeof args[0] !== 'function' && args.shift()) || {};
		const buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
		const singular = ['string', 'number'].includes(typeof clauses.where) && clauses.returning;
		return this.database.client.withSchema(async () => {
			const payload = [clauses.set || clauses.data];
			const [columns, [{ row: values }]] = await this.resolvePayload(payload, clauses.set ? 'payload-array' : 'payload');
			const { data: _, shorthands: __, ...$clauses } = { ...(await this.resolveWhereClause(clauses)), table: [[this.database.name, this.name]], set: columns.map((c, i) => [c, values[i]]) };
			const query = this.createQuery($clauses, UpdateStatement, `table.update()`);
			buildCallback?.(query);
			console.log('>>>>>>>' + query);
			const result = await this.database.client.execQuery(query, {inspect: true });
			if (singular) return result[0];
			return result;
		});
	}

	async delete(...args) {
		if (!args.length) throw new Error(`The "clauses" parameter cannot be ommitted.`);
		const clauses = (typeof args[0] !== 'function' && {...args.shift()}) || {};
		const buildCallback = (typeof args[0] === 'function' && args.shift()) || null;
		const singular = ['string', 'number'].includes(typeof clauses.where) && clauses.returning;
		return this.database.client.withSchema(async () => {
			// Compose JSON
			const $clauses = { ...(await this.resolveWhereClause(clauses)), from: [[this.database.name, this.name]] };
			const query = this.createQuery($clauses, DeleteStatement, `table.delete()`);
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

	async resolvePayload(payload, payloadType) {
		if (payloadType === 'payload-array') {
			if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new TypeError(`Invalid payload format.`);
		} else {
			if (!_isObject(payload[0])) throw new TypeError(`Invalid payload format.`);
		}
		const columns = await this.buildShapePath(payload[0], payloadType);
		const valueMatrix = payload.map((data) => ({ row: this.buildValueMatrix(data, columns, payloadType) }));
		return [columns, valueMatrix];
	}

	async buildShapePath(shape, shapeType) {
		const tblSchema = await this.schema();
		if (!tblSchema) throw new Error(`Table ${this.ident} does not exist.`);
		const dimensionType = shapeType === 'fields' ? 'fields' : 'columns';
		const isPayload = ['payload', 'payload-array'].includes(shapeType);
		const tbl2BuildShapePath = async (tbl2, shape, fkName = null) => {
			if (fkName) {
				const fk = (await tbl2.schema())?.column(fkName)?.foreignKey();
				if (!fk?.targetTable().identifiesAs(this.ident)) throw new Error(`${tbl2.ident}.${fkName} isn't a reference to ${this.ident}`);
				return await tbl2.buildShapePath(shape, shapeType);
			}
			const fks = (await tbl2.schema()).foreignKeys().filter((fk) => fk.targetTable().identifiesAs(this.ident));
			if (fks.length !== 1) throw new Error(`${fks.length} correletions found between ${this.ident} and ${tbl2.ident}`);
			return [fks[0].columns()[0], await tbl2.buildShapePath(shape, shapeType)];
		};
		const resolveKey = async (key, value) => {
			const colSchema = tblSchema.column(key);
			const fk = colSchema?.foreignKey();
			if (fk && !isPayload && typeof value === 'string') {
				return { rpath: [key, value] };
			}
			if (fk && (_isObject(value) || Array.isArray(value))) {
				const targetTable = this.database.client.database(fk.targetTable().prefix(true).name()).table(fk.targetTable().name());
				return { rpath: [key, { [dimensionType]: await targetTable.buildShapePath(value, shapeType) }] };
			}
			if (!colSchema) {
				if (isPayload) {
					if (!Array.isArray(value)) throw new Error(`Unknown column: ${key}`);
				} else if (Array.isArray(value) && (value.some((e) => typeof e === 'string') || value.length > 1)) {
					value = [value]; // { books: ['key1', 'key2'] } -> { books: [['key1', 'key2']] }, { books: [{ key1: true }, { key2: true }] } -> { books: [[{ key1: true }, { key2: true }]] }
				} else if (_isObject(value)) {
					value = [value]; // { books: { key1: true, key2: true } } -> { books: [{ key1: true, key2: true }] }
				} else if (typeof value === 'string') {
					value = [[value]]; // { books: 'title' } -> { books: [['title']] }
				}
				const tbl2 = this.database.table(key);
				const [fkName, columns] = await tbl2BuildShapePath(tbl2, value[0]);
				const dimension = { [dimensionType]: columns };
				return { rpath: [{ lpath: [fkName, [this.database.name, key]] }, shapeType === 'fields' ? { expr: dimension }/* aggr */ : dimension] };
			}
			return key;
		};
		const columns = [];
		if (_isObject(shape)) {
			for (const key in shape) {
				if (!isPayload && shape[key] === false) continue;
				columns.push(await resolveKey(key, shape[key]));
			}
			return columns;
		}
		for (const key of shape) {
			if (shapeType === 'payload-array') {
				if (_isObject(key[0])) {
					if (!key[0].lpath) throw new Error(`Invalid key spec: ${JSON.stringify(key[0])}`);
					const tableSpec = [].concat(key[0].lpath[1]);
					const db2 = tableSpec.length === 2 ? this.database.client.database(tableSpec.shift()) : this.database;
					const tbl2 = db2.table(tableSpec.shift());
					columns.push({ rpath: [key[0], { columns: await tbl2BuildShapePath(tbl2, key[1][0], key[0].lpath[0]) }] });
				} else {
					columns.push(await resolveKey(key[0], key[1]));
				}
			} else if (_isObject(key)) {
				columns.push(await resolveKey(Object.keys(key)[0], Object.values(key)[0]));
			} else columns.push(key);
		}
		return columns;
	}

	buildValueMatrix(data, columns, payloadType) {
		const getValue = (from, key, i) => {
			if (payloadType === 'payload') return from[key];
			if (payloadType === 'payload-array') return from[i][1];
			return from[i]; // 'value-matrix'
		};
		const asMap = payloadType === 'payload';
		if ((asMap && !_isObject(data)) || (!asMap && !Array.isArray(data))) throw new Error(`Irregular payload structure: expected an object of shape ${JSON.stringify(columns)} but got: ${data}`);
		const valueMatrix = [], colsLength = columns.length;
		for (let i = 0; i < colsLength; i ++) {
			const column = columns[i];
			if (column.rpath) {
				const key = column.rpath[0];
				const columns = column.rpath[1].columns || [column.rpath[1]];
				if (key.lpath) {
					const [, [, table]] = key.lpath;
					const values = getValue(data, table, i);
					if (!Array.isArray(values)) throw new Error(`Irregular payload structure: expected an array of ${table} of shape ${JSON.stringify(columns)} but got: ${values}`);
					valueMatrix.push({ values: values.map((data) => ({ row: this.buildValueMatrix(data, columns, payloadType) })) });
				} else {
					const row = getValue(data, key, i);
					valueMatrix.push({ row: this.buildValueMatrix(row, columns, payloadType) });
				}
			} else {
				const value = getValue(data, column, i);
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