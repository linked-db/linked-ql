import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { OrderCriteria } from './OrderCriteria.js';

export class OrderByClause extends AbstractNodeList {
	static get EXPECTED_TYPES() { return [OrderCriteria]; }
	static get REGEX() { return 'ORDER\\s+BY'; }

	withRollup() { return this.withFlag('WITH_ROLLUP'); }

	static parse(context, expr, parseCallback) {
		const [ clauseMatch, columnsSpec, withRollup ] = expr.match(new RegExp(`^${ this.REGEX }([\\s\\S]*)(\\s+WITH\\s+ROLLUP)?$`, 'i')) || [];
		if (!clauseMatch) return;
		const instance = super.parse(context, columnsSpec, parseCallback);
		if (!instance) return;
		if (withRollup) instance.withFlag('WITH_ROLLUP');
		return instance;
	}

	stringify() { return !this.entries().length ? '' : ['ORDER BY', super.stringify()].concat(this.hasFlag('WITH_ROLLUP') ? 'WITH ROLLUP' : []).join(' '); }
}