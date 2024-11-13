import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { ColumnRef } from '../../expr/refs/ColumnRef.js';
import { PathRight } from '../../expr/path/PathRight.js';

export class ColumnsSpec extends AbstractNodeList {
    static get EXPECTED_TYPES() { return [PathRight, ColumnRef]; }
    static get TAGS() { return ['(', ')']; }

	static get expose() {
		return {
			columns: (context, ...entries) => this.fromJSON(context, { entries }),
		};
	}

}