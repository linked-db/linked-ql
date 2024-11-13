import { AbstractNodeList } from '../abstracts/AbstractNodeList.js';
import { Exprs } from '../grammar.js';

export class Array extends AbstractNodeList {
    static get EXPECTED_TYPES() { return Exprs; }
    static get CLAUSE() { return 'ARRAY'; }
    static get TAGS() { return ['[', ']']; }

	static get expose() {
		return {
			array: (context, ...entries) => this.fromJSON(context, { entries }),
		};
	}
}