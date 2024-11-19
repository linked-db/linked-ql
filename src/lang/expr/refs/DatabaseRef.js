import { AbstractRef } from './AbstractRef.js';

export class DatabaseRef extends AbstractRef {
	static get KIND() { return 'DATABASE'; }
	
	prefix(value) {}
}