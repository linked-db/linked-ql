import { LQDeepDeepRef1 } from './LQDeepDeepRef1.js';
import { registry } from '../../registry.js';

export class LQDeepDeepRef2 extends LQDeepDeepRef1 {

	/* SYNTAX RULES */

	static get _rightType() { return ['LQDeepDeepRef2', 'ColumnRef2', 'ColumnsConstructor']; } // for inheritance

	/* JSON API */

	jsonfy({ toDeepRef = false, toKind = 2, ...options } = {}, transformer = null, schemaInference = null) {
		return super.jsonfy({ toDeepRef, toKind, ...options }, transformer = null, schemaInference);
	}
}