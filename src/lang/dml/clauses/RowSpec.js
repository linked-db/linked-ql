import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { Exprs } from '../../expr/grammar.js';

export class RowSpec extends AbstractNodeList {
    static get EXPECTED_TYPES() { return Exprs; }
    static get MIN_ENTRIES() { return 2; }
    static get TAGS() { return ['(', ')']; }

	static get expose() {
		return {
			row: (context, ...entries) => this.fromJSON(context, { entries }),
		};
	}
}