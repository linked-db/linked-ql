
import AbstractTable from '../abstracts/AbstractTable.js';
import SQLCursor from './SQLCursor.js';

export default class SQLTable extends AbstractTable {

	/**
	 * Returns a cursor.
	 * 
	 * @return SQLCursor
	 */
	getCursor() { return new SQLCursor(this); }
}