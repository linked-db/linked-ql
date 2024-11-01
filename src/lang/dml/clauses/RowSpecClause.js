import { ValuesClause } from './ValuesClause.js';
import { RowSpec } from './RowSpec.js';

export class RowSpecClause extends RowSpec {
    static get MIN_ENTRIES() { return 0; }
    static get CLAUSE() { return 'ROW'; }

    stringify() {
		const str = super.stringify();
		return this.contextNode instanceof ValuesClause
			? `(${str})`
			: str;
    }
}