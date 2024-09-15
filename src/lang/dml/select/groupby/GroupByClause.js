
import Lexer from '../../../Lexer.js';
import AbstractGroupBy from './AbstractGroupBy.js';

export default class GroupByClause extends AbstractGroupBy {

	/**
	 * Sets the WITH_ROLLUP flag.
	 * 
	 * @returns this
	 */
	withRollup() { return this.withFlag('WITH_ROLLUP'); }

	stringify() { return ['GROUP BY', super.stringify(), ...this.FLAGS.map(s => s.replace(/_/g, ' '))].join(' '); }

	static parse(context, expr, parseCallback) {
		const { tokens: [$expr], matches } = Lexer.lex(expr, ['\\s+WITH\\s+ROLLUP$'], { useRegex: 'i' });
		const instance = super.parse(context, $expr, parseCallback);
		if (!instance) return;
		if (matches.length) instance.withFlag('WITH_ROLLUP');
		return instance;
	}
}