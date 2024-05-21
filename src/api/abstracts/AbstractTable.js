
import { _isTypeObject, _isNull, _isString, _isNumeric, _isUndefined, _isObject } from '@webqit/util/js/index.js';
import { _from as _arrFrom, _intersect } from '@webqit/util/arr/index.js';
import { _wrapped } from '@webqit/util/str/index.js';
import Savepoint from './Savepoint.js';

export default class AbstractTable {
	 
	/**
	 * @constructor
	 */
	constructor(database, tblName, params = {}) {
        this.$ = {
            database,
            schema: database.$.schema.tables.get(tblName),
            params
        };
	}

    /**
     * @property String
     */
    get name() { return this.$.schema.name; }

    /**
     * @property Database
     */
    get database() { return this.$.database; }

    /**
     * @property Object
     */
    get params() { return this.$.params; }

    /**
     * @property Bool
     */
    get dropped() { return this.$.schema.hiddenAs === 'dropped'; }

	/**
     * @returns Object
     */
	async schema() { return await this.database.describeTable(this.name); }

    /**
	 * Returns the table's current savepoint.
	 * 
     * @param Object params
	 * 
	 * @returns Object
     */
    async savepoint(params = {}) {
		const OBJ_INFOSCHEMA_DB = this.database.client.constructor.OBJ_INFOSCHEMA_DB;
		if ((await this.database.client.databases({ name: OBJ_INFOSCHEMA_DB }))[0]) {
			const forward = params.direction === 'forward';
            const dbName = [OBJ_INFOSCHEMA_DB,'database_savepoints'];
            const tblName = [OBJ_INFOSCHEMA_DB,'table_savepoints'];
			const tblFields = ['name_snapshot', 'columns_snapshot', 'constraints_snapshot', 'indexes_snapshot', 'current_name'];
			const dbFields = ['id', 'name_snapshot', 'savepoint_desc', 'savepoint_date', 'rollback_date', 'current_name'];
            const result = await this.database.client.query(q => {
                q.from(tblName).as('tbl');
				q.select( ...tblFields.map(name => ['tbl',name]) );
				q.select( ...dbFields.map(name => f => f.name(['db',name]).as(`db_${ name }`)) );
				q.rightJoin(dbName).as('db').on( x => x.equals(['db','id'], ['tbl','savepoint_id']), x => x.in( y => y.literal(this.database.name), ['db','name_snapshot'], ['db','current_name'] ), x => x[forward ? 'isNotNull' : 'isNull'](['db','rollback_date']) );
				q.where( x => x.in( x => x.literal(this.name), ['tbl','name_snapshot'], ['tbl','current_name'] ) );
				q.orderBy(['db','savepoint_date']).withFlag(forward ? 'ASC' : 'DESC');
                q.limit(1);
            });
			if (!result[0]) return;
			const [ tblDetails, dbDetails ] = Object.keys(result[0]).reduce(([tblDetails, dbDetails], key) => {
				if (key.startsWith('db_')) return [tblDetails, { ...dbDetails, [key.replace('db_', '')]: result[0][key] }];
				return [{ ...tblDetails, [key]: result[0][key] }, dbDetails];
			}, [{}, {}]);
			const context = new Savepoint(this.database.client, dbDetails, params.direction);
			return Object.defineProperty(tblDetails, 'context', { get: () => context, });
		}
    }

	/**
	 * ----------
	 * SCHEMA UTILS
	 * ----------
	 */

	/**
	 * Get Primary Key columns from schema.
	 * 
	 * @returns Array
	 */
	async primaryKeyColumns() { return (await this.columnsForConstraint('PRIMARY_KEY'))[0]; }

	/**
	 * Get columns that have given constraintType.
	 * 
	 * @param String constraintType
	 * 
	 * @returns Array
	 */
	async columnsForConstraint(constraintType) {
		const schema = await this.database.describeTable(this.name);
		const inlineConstraintTypesMap = { 'PRIMARY_KEY': 'primaryKey', 'UNIQUE': 'uniqueKey', 'CHECK': 'check', 'FOREIGN_KEY': 'references' };
		let columns = !(constraintType in inlineConstraintTypesMap) ? [] : schema.columns.filter(col => col[inlineConstraintTypesMap[constraintType]]).map(col => [col.name]);
		if (schema.constraints.length) { columns = columns.concat(schema.constraints.filter(cnst => cnst.type === constraintType).reduce((cols, cnst) => cols.concat([cnst.columns]))); }
		return columns;
	}

	/**
	 * Get columns that have given indexType.
	 * 
	 * @param String indexType
	 * 
	 * @returns Array
	 */
	async columnsForIndex(indexType) {
		const schema = await this.database.describeTable(this.name);
		if (schema.indexes.length) { return schema.indexes.filter(index => index.type === indexType).reduce((cols, index) => cols.concat([index.columns])); }
		return [];
	}

	/**
	 * ----------
	 * QUERY UTILS
	 * ----------
	 */

	/**
	 * Syncs a cursor.
	 * 
	 * @param Cursor cursor
	 * 
	 * @return Number
	 */
	async syncCursor(cursor) { return await this.putAll(cursor.cache); }

	/**
	 * @inheritdoc
	 */
	async match(rowObj) {
		// -----------
		let primaryKey, existing;
		if (this.def.schema.primaryKey 
		&& (primaryKey = readKeyPath(rowObj, this.def.schema.primaryKey)) 
		&& (existing = await this.get(primaryKey))) {
			return {
				matchingKey: 'PRIMARY_KEY',
				primaryKey,
				row: existing,
			};
		}
		// -----------
		const primaryKeyColumns = await this.primaryKeyColumns();
		const uniqueKeyColumns = await this.columnsForConstraint('UNIQUE');
		primaryKeyColumns.concat(uniqueKeyColumns).map(columns => {
			return `(${ columns.map(col => `${ this.quote(obj[col]) } IN (${ columns.join(',') })`).join(' AND ') })`;
		}).join(' OR ');

		var match, uniqueKeys = Object.keys(this.def.schema.indexes).filter(alias => this.def.schema.indexes[alias].type === 'unique');
		if (uniqueKeys.length) {
			(await this.getAll()).forEach((existingRow, i) => {
				if (match) return;
				uniqueKeys.forEach(constraintName => {
					var keyPath = this.def.schema.indexes[constraintName].keyPath;
					if (existingRow && readKeyPath(rowObj, keyPath) === readKeyPath(existingRow, keyPath)) {
						match = {
							matchingKey: constraintName,
							primaryKey: this.def.schema.primaryKey ? readKeyPath(existingRow, this.def.schema.primaryKey) : i,
							row: {...existingRow},
						};
					}
				});
			});
		}

		return match;
	}
	
	/**
	 * -------------------------------
	 */

	/**
	 * @inheritdoc
	 */
	async addAll(multiValues, columns = [], duplicateKeyCallback = null, forceAutoIncrement = false) {
		const inserts = [], forUpdates = [];
		for (const values of multiValues) {
			let rowObj = values;
			if (Array.isArray(values)) {
				const columnNames = columns.length ? columns : (await this.schema()).columns.map(col => col.name);
				if (columnNames.length && columnNames.length !== values.length) {
					throw new Error(`Column/values count mismatch at line ${ multiValues.indexOf(values) }.`);
				}
				rowObj = columnNames.reduce((rowObj, name, i) => ({ ...rowObj, [name]: values[i], }), {});
			}
			// -------------
			await this.handleInput(rowObj, true);					
			// -------------
			if (await this.shouldMatchInput(rowObj) || duplicateKeyCallback) {
				const match = await this.match(rowObj);
				if (match && duplicateKeyCallback) {
					const duplicateRow = { ...match.row };
					if (duplicateKeyCallback(duplicateRow, rowObj)) {
						forUpdates.push(duplicateRow);
					}
					// The duplicate situation had been handled
					// ...positive or negative
					inserts.push('0');
					continue;
				}
				// We're finally going to add!
				// We must not do this earlier...
				// as "onupdate" rows will erronously take on a new timestamp on this column
				await this.beforeAdd(rowObj, match);
				inserts.push(await this.add(rowObj));
				continue;
			}
			await this.beforeAdd(rowObj);
			inserts.push(await this.add(rowObj));
		}
		// OnDuplicateKey updates
		if (forUpdates.length) { inserts = inserts.concat(await this.putAll(forUpdates)); }
		return inserts.filter((n, i) => n !== 0 && inserts.indexOf(n) === i);
	}
		
	/**
	 * @inheritdoc
	 */
	async beforeAdd(rowObj, match) {
		const timestamp = (new Date).toISOString();
		for (const column of (await this.schema()).columns) {
			const columnType = _isObject(column.type) ? column.type.name : column.type;
			if ((columnType === 'datetime' || columnType === 'timestamp') && column.default.expr === 'CURRENT_TIMESTAMP') {
				rowObj[column.name] = timestamp;
			}
		}
	}
	 
	/**
	 * @inheritdoc
	 */
	async putAll(multiRows) {
		const updates = [];
		for (const rowObj of multiRows) {
			// -------------
			await this.handleInput(rowObj);					
			// -------------
			if (await this.shouldMatchInput(rowObj)) {
				await this.beforePut(rowObj, await this.match(rowObj));
				updates.push(await this.put(rowObj));
				continue;
			}
			await this.beforePut(rowObj);
			updates.push(await this.put(rowObj));
		}
		return updates;
	}
		
	/**
	 * @inheritdoc
	 */
	async beforePut(rowObj, match) {
		if (match && !Object.keys(rowObj).every(key => rowObj[key] === match.row[key])) {
			const timestamp = (new Date).toISOString();
			for (const column of (await this.schema()).columns) {
				const columnType = _isObject(column.type) ? column.type.name : column.type;
				if ((columnType === 'datetime' || columnType === 'timestamp') && column.onupdate === 'CURRENT_TIMESTAMP') {
					rowObj[column.name] = timestamp;
				}
			}
		}
	}
	 
	/**
	 * @inheritdoc
	 */
	async deleteAll(multiIDs) {
		const deletes = [];
		for (const primaryKey of multiIDs) {
			deletes.push(this.delete(await this.beforeDelete(primaryKey)));
		}
		return deletes;
	}
		
	/**
	 * @inheritdoc
	 */
	async beforeDelete(primaryKey) {	
		return primaryKey;
	}
	
	/**
	 * -------------------------------
	 */

	/**
	 * @inheritdoc
	 */
	async handleInput(rowObj, applyDefaults = false) {
		const rowObjColumns = Object.keys(rowObj);
		const schema = await this.schema();
		const schemaColumns = schema.columns.map(col => col.name);
		// ------------------
		const unknownFields = rowObjColumns.filter(col => schemaColumns.indexOf(col) === -1);
		if (unknownFields.length) { throw new Error(`Unknown column: ${ unknownFields[0] }`); }
		// ------------------
		for (const columnName of schemaColumns) {
			const value = rowObj[columnName];
			const column = schema.columns.find(col => col.name === columnName) || {};
			if (rowObjColumns.includes(columnName)) {
				const columnType = _isObject(column.type) ? column.type.name : column.type;
				// TODO: Validate supplied value
				if (columnType === 'json') {
					if (!_isTypeObject(value) && (!_isString(value) || (!_wrapped(value, '[', ']') && !_wrapped(value, '{', '}')))) {
					}
				} else if (['char', 'tinytext', 'smalltext', 'text', 'bigtext', 'varchar'].includes(columnType)) {
					if (!_isString(value)) {
					}
				} else if (['bit', 'tinyint', 'smallint', 'int', 'bigint', 'decimal', 'number', 'float', 'real'].includes(columnType)) {
					if (!_isNumeric(value)) {
					}
				} else if (['enum', 'set'].includes(columnType)) {
					if (!_isNumeric(value)) {
					}
				} else if (['date', 'datetime', 'timestamp'].includes(columnType)) {
					if (!_isString(value)) {
					}
				}
			} else if (applyDefaults && !_intersect([columnName], await this.primaryKeyColumns()).length) {
				// DONE: Apply defaults...
				rowObj[columnName] = ('default' in column) && !(['date', 'datetime', 'timestamp'].includes(columnType) && column.default.expr === 'CURRENT_TIMESTAMP') 
					? column.default.value
					: null;
			}
			// Non-nullable
			if (column.notNull && (_isNull(rowObj[columnName]) || _isUndefined(rowObj[columnName]))) {
				throw new Error(`Inserting NULL on non-nullable column: ${ columnName }.`);
			}
		}
	}
		
	/**
	 * @inheritdoc
	 */
	async shouldMatchInput(rowObj) {
		return (await this.schema()).columns.some(column => {
			const columnType = _isObject(column.type) ? column.type.name : column.type;
			return ['datetime', 'timestamp'].includes(columnType) && (
				column.default.expr === 'CURRENT_TIMESTAMP' || column.onupdate === 'CURRENT_TIMESTAMP'
			);
		});
	}
}

/**
 * @AutoIncremen
 */
const readKeyPath = (rowObj, keyPath) => {
	return _arrFrom(keyPath).map(key => rowObj[key]).filter(v => v).join('-');
};
