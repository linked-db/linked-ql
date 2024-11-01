import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { Exprs } from '../../expr/grammar.js';

export class GroupByClause extends AbstractNodeList {
	static get EXPECTED_TYPES() { return Exprs; }
	static get REGEX() { return 'GROUP\\s+BY'; }

	withRollup() { return this.withFlag('WITH_ROLLUP'); }

	static parse(context, expr, parseCallback) {
		const [ clauseMatch, columnsSpec, withRollup ] = expr.match(new RegExp(`^${ this.REGEX }([\\s\\S]*)(\\s+WITH\\s+ROLLUP)?$`, 'i')) || [];
		if (!clauseMatch) return;
		const instance = super.parse(context, columnsSpec, parseCallback);
		if (!instance) return;
		if (withRollup) instance.withFlag('WITH_ROLLUP');
		return instance;
	}

	stringify() { return !this.entries().length ? '' : ['GROUP BY', super.stringify()].concat(this.hasFlag('WITH_ROLLUP') ? 'WITH ROLLUP' : []).join(' '); }
}