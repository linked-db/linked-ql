
import Expr from '../../lang/components/Expr.js';
import Identifier from '../../lang/components/Identifier.js';
import AbstractTable from '../AbstractTable.js';
import SQLCursor from './SQLCursor.js';

export default class SQLTable extends AbstractTable {

	/**
	 * Returns a cursor.
	 * 
	 * @return SQLCursor
	 */
	getCursor() { return new SQLCursor(this); }
}