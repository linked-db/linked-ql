import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { Exprs } from '../../expr/grammar.js';

export class PartitionByClause extends AbstractNodeList {
	static get EXPECTED_TYPES() { return Exprs; }
	static get REGEX() { return 'PARTITION\\s+BY'; }

	static parse(context, expr, parseCallback) {
		const [ clauseMatch, columnsSpec ] = expr.match(new RegExp(`^${ this.REGEX }([\\s\\S]*)$`, 'i')) || [];
		if (!clauseMatch) return;
		return super.parse(context, columnsSpec, parseCallback);
	}

	stringify() { return !this.entries().length ? '' : ['PARTITION BY', super.stringify()].join(' '); }
}