import { DatabaseRef } from './DatabaseRef.js';

export class GlobalDatabaseRef extends DatabaseRef {
	static get NODE_NAME() { return DatabaseRef.NODE_NAME; }
	get global() { return true; }
}