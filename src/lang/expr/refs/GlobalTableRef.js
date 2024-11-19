import { GlobalDatabaseRef } from './GlobalDatabaseRef.js';
import { TableRef } from './TableRef.js';

export class GlobalTableRef extends TableRef {
	static get NODE_NAME() { return TableRef.NODE_NAME; }
	static get PREFIX_TYPE() { return GlobalDatabaseRef; }
	get global() { return true; }
}