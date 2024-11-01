import { AbstractTable } from '../AbstractTable.js';
import { SQLCursor } from './SQLCursor.js';

export class SQLTable extends AbstractTable {

	/**
	 * Returns a cursor.
	 * 
	 * @return SQLCursor
	 */
	getCursor() { return new SQLCursor(this); }
}