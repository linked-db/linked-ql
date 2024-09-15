
import Lexer from '../../../Lexer.js';
import AbstractOrderBy from './AbstractOrderBy.js';

export default class OrderByClause extends AbstractOrderBy {

	/**
	 * Sets the WITH_ROLLUP flag.
	 * 
	 * @returns this
	 */
	withRollup() { return this.withFlag('WITH_ROLLUP'); }
	
	stringify() { return ['ORDER BY', super.stringify(), ...this.FLAGS.map(s => s.replace(/_/g, ' '))].join(' '); }

	static parse(context, expr, parseCallback) {
		const { tokens: [$expr], matches } = Lexer.lex(expr, ['\\s+WITH\\s+ROLLUP$'], { useRegex: 'i' });
		const instance = super.parse(context, $expr.trim(), parseCallback);
		if (!instance) return;
		if (matches.length) instance.withFlag('WITH_ROLLUP');
		return instance;
	}
}