import { LQDeepRef1 } from './LQDeepRef1.js';

export class LQDeepRef2 extends LQDeepRef1 {

	/* SYNTAX RULES */
	
	static get _rightType() { return ['LQDeepDeepRef2', 'ColumnRef2', 'ColumnsConstructor']; } // for inheritance

	static get syntaxPriority() { return -1; }

	/* JSON API */

	resolve(transformer, dbContext, toKind = 2) {
		return super.resolve(transformer, dbContext, toKind);
	}

	jsonfy({ toDeepRef = false, toKind = 2, ...options } = {}, transformer = null, dbContext = null) {
		return super.jsonfy({ toDeepRef, toKind, ...options }, transformer, dbContext);
	}
}