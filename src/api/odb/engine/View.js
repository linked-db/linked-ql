
import AbstractCursor from './AbstractCursor.js';
import AbstractTable from '../api/AbstractTable.js';

export default class View extends AbstractTable {
	 
	/**
	 * @constructor
	 */
	constructor(stmt, database, tableName, def, params = {}) {
		super(database, tableName, def, params);
		this.stmt = stmt;
	}

	/**
	 * Returns a cursor.
	 * 
	 * @return Cursor
	 */
	getCursor() { return new AbstractCursor((this.def.data || []).filter(row => row)); }

	/**
	 * Syncs cursors at the base.
	 * 
	 * @param Cursor cursor
	 * 
	 * @return Number
	 */
	async syncCursor(cursor) { return this.stmt.base.syncCursors(); }
}