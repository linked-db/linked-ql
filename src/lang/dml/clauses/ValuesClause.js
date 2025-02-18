import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { Parens } from '../../expr/Parens.js';
import { RowSpec } from './RowSpec.js';

export class ValuesClause extends AbstractNodeList {
    static get EXPECTED_TYPES() { return [RowSpec, Parens]; }
    static get ARGS_DELEGATION() { return 'add'; }
    static get CLAUSE() { return 'VALUES'; }

	static get expose() {
		return {
			values: (context, ...entries) => this.fromJSON(context, { entries }),
		};
	}
}