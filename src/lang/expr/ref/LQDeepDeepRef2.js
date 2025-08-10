import { LQDeepDeepRef1 } from './LQDeepDeepRef1.js';
import { registry } from '../../registry.js';

export class LQDeepDeepRef2 extends LQDeepDeepRef1 {

	/* SYNTAX RULES */

	static get _rightType() { return ['LQDeepDeepRef2', 'ColumnRef2', 'ColumnsConstructor']; } // for inheritance

	static morphsTo() { return registry.LQDeepRef2; }

	/* JSON API */

	jsonfy({ toDeepRef = false, ...options } = {}, transformer = null, linkedDb = null) {
		if (toDeepRef) {
			return {
				nodeName: registry.LQDeepRef2.NODE_NAME,
				left: this.left().jsonfy(),
				right: this.right().jsonfy()
			};
		}
		return super.jsonfy(options, transformer, linkedDb);
	}
}