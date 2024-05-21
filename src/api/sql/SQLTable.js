
import { _isObject, _isNull, _isNumeric } from '@webqit/util/js/index.js';
import SQLInsertQueryInspector from './SQLInsertQueryInspector.js';
import SQLDeleteQueryInspector from './SQLDeleteQueryInspector.js';
import AbstractTable from '../abstracts/AbstractTable.js';
import SQLCursor from './SQLCursor.js';

/**
 * ---------------------------
 * SQLTable class
 * ---------------------------
 */

export default class SQLTable extends AbstractTable {

	/**
	 * Returns a cursor.
	 * 
	 * @return SQLCursor
	 */
	getCursor() { return new SQLCursor(this); }
	 
	/**
	 * @inheritdoc
	 */
	async getAll() {
		return new Promise((resolve, reject) => {
			this.database.client.driver.query(`SELECT * FROM ${ this.database.name }.${ this.name }`, (err, result) => {
				if (err) return reject(err);
				resolve((result.rows || result));
			});
		});
	}
	 
	/**
	 * @inheritdoc
	 */
	async get(primaryKey) {
		const primaryKeyColumns = await this.primaryKeyColumns();
		if (!primaryKeyColumns.length) throw new Error(`Table has no primary key defined.`);
		return new Promise((resolve, reject) => {
			this.database.client.driver.query(`SELECT * FROM ${ this.database.name }.${ this.name } WHERE '${ primaryKey }' IN (${ primaryKeyColumns.join(',') })`, [], (err, result) => {
				if (err) return reject(err);
				resolve((result.rows || result)[0]);
			});
		});
	}
	
	/**
	 * @inheritdoc
	 */
	async count(query = '*') {
		return new Promise((resolve, reject) => {
			this.database.client.driver.query(`SELECT COUNT(${ query }) AS c FROM ${ this.database.name }.${ this.name }`, (err, result) => {
				if (err) return reject(err);
				resolve((result.rows || result)[0].c);
			});
		});
	}
	
	/**
	 * @inheritdoc
	 */
	async addAll(entries, columns = [], duplicateKeyCallback = null) {
		if (!entries.length) return;
		let duplicateKeyUpdateObj = {};
		if (!columns.length) {
			if (_isObject(entries[0])) {
				columns = Object.keys(entries[0]);
			} else {
				const schema = await this.database.describeTable(this.name);
				columns = schema.columns.map(col => col.name);
			}
		}		
		return new Promise((resolve, reject) => {
			let insertSql = `INSERT INTO ${ this.database.name }.${ this.name }\n\t${ columns.length ? `(${ columns.join(',') })\n\t` : `` }`;
			insertSql += `VALUES\n\t${ entries.map(row => formatAddRow(Object.values(row), this.database.client.params.dialect)).join(`,\n\t`) }`;
			if (duplicateKeyCallback) {
				duplicateKeyCallback(duplicateKeyUpdateObj);
				insertSql += ` ${ this.database.client.params.dialect === 'mysql' ? 'ON DUPLICATE KEY UPDATE' : /*postgres*/'ON CONFLICT DO UPDATE SET' } ${ formatAssignments(duplicateKeyUpdateObj, this.database.client.params.dialect) }`;
			}
			this.database.client.driver.query(insertSql, (err, result) => {
				if (err) return reject(err);
				resolve(new SQLInsertQueryInspector(
					this, 
					result, 
					columns, 
					entries, 
					duplicateKeyUpdateObj
				));
			});
		});
	}

	/**
	 * @inheritdoc
	 */
	async add(rowObj) {
		return new Promise((resolve, reject) => {
			let insertSql = `INSERT INTO ${ this.database.name }.${ this.name }\n\t(${ Object.keys(rowObj).join(',') })\n\t`;
			insertSql += `VALUES\n\t${ formatAddRow(Object.values(rowObj), this.database.client.params.dialect) }\n\t`;
			insertSql += 'RETURNING *';
			this.database.client.driver.query(insertSql, (err, result) => {
				if (err) return reject(err);
				resolve(new SQLInsertQueryInspector(
					this,
					result,
					Object.keys(rowObj), 
					Object.values(rowObj), 
				));
			});
		});
	}
	
	/**
	 * @inheritdoc
	 */
	async putAll(rowObjs) {
		await Promise.all(rowObjs.map(rowObj => this.put(rowObj)));
		return new SQLInsertQueryInspector(
			this, 
			{}, 
			Object.keys(rowObjs[0]), 
			rowObjs, 
		);
	}

	/**
	 * @inheritdoc
	 */
	async put(rowObj) {
		return new Promise((resolve, reject) => {
			const putSql = `INSERT INTO ${ this.database.name }.${ this.name }\n\t${ formatPutRow(rowObj, this.database.client.params.dialect) }`;
			this.database.client.driver.query(putSql, (err, result) => {
				if (err) return reject(err);
				resolve(new SQLInsertQueryInspector(
					this, 
					result, 
					Object.keys(rowObj), 
					Object.values(rowObj), 
				));
			});
		});
	}
	
	/**
	 * @inheritdoc
	 */
	async deleteAll(IDs = []) {
		const primaryKeyColumns = await this.primaryKeyColumns();
		if (!primaryKeyColumns.length) throw new Error(`Table has no primary key defined.`);
		return new Promise((resolve, reject) => {
			const deleteSql = `DELETE FROM ${ this.database.name }.${ this.name }${ IDs.length ? ` WHERE ${ IDs.map(id => `'${ id }' in (${ primaryKeyColumns.join(',') })`).join(' OR ') }` : ''}`;
			this.database.client.driver.query(deleteSql, [], (err, result) => {
				if (err) return reject(err);
				resolve(new SQLDeleteQueryInspector(
					this,
					result
				));
			});
		});
	}

	/**
	 * @inheritdoc
	 */
	async delete(primaryKey) {
		const primaryKeyColumns = await this.primaryKeyColumns();
		if (!primaryKeyColumns.length) throw new Error(`Table has no primary key defined.`);
		return new Promise((resolve, reject) => {
			const deleteSql = `DELETE FROM ${ this.database.name }.${ this.name } WHERE ${ primaryKey } IN (${ primaryKeyColumns.join(',') })`;
			this.database.client.driver.query(deleteSql, [], (err, result) => {
				if (err) return reject(err);
				resolve(new SQLDeleteQueryInspector(
					this,
					result
				));
			});
		});
	}

}

/**
 * --------
 * HELPERS
 * --------
 */
const formatVal = (val, dialect) => {
	if (val instanceof Date) {
		try { return `'${ val.toISOString().split('.')[0] }'`; }
		catch(e) { return 'NULL'; }
	}
	return _isNumeric(val) ? val : (_isNull(val) ? 'NULL' : (dialect === 'mysql' ? `'${ val.replace(/'/g, `\\'`) }'` : `'${ val.replace(/'/g, `''`) }'`));
};
const formatAddRow = (values, dialect) => '(' + values.map(val => formatVal(val, dialect)).join(',') + ')';
const formatAssignments = (rowObj, dialect) => Object.keys(rowObj).map(key => `${ key } = ${ formatVal(rowObj[key], dialect) }`).join(',');
const formatPutRow = (rowObj, dialect) => {
	const assignments = formatAssignments(rowObj, dialect);
	return `SET ${ assignments } ${ dialect === 'mysql' ? 'ON DUPLICATE KEY UPDATE' : /*postgres*/'ON CONFLICT DO UPDATE SET' } ${ assignments }`;
};

