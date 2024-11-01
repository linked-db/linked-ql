import { AbstractRef } from './AbstractRef.js';
import { DatabaseRef } from './DatabaseRef.js';

export class TableRef extends AbstractRef {
	static get PREFIX_TYPE() { return DatabaseRef; }
	static get KIND() { return 'TABLE'; }
}