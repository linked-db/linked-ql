import { AbstractTable } from '../AbstractTable.js';
import { SQLCursor } from './SQLCursor.js';

export class SQLTable extends AbstractTable {

	getCursor() { return new SQLCursor(this); }
}