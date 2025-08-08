import { LQDeepRef1 } from './LQDeepRef1.js';

export class LQDeepRef2 extends LQDeepRef1 {

	/* SYNTAX RULES */
	
	static get _rightType() { return ['LQDeepDeepRef2', 'ColumnRef2', 'ColumnsConstructor']; } // for inheritance

	static get syntaxPriority() { return -1; }
}