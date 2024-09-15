
import Lexer from '../Lexer.js';
import Identifier from './Identifier.js';
import Condition from './Condition.js';
import Assertion from './Assertion.js';
import Table from './Table.js';

export default class JoinClause extends Table {
	 
	/**
	 * Instance properties
	 */
	TYPE = '';
	CORRELATION = null;

	/**
	 * Creates a full join
	 * 
	 * @param Any table
	 * 
	 * @returns Void
	 */
	full(table) {
		this.TYPE = 'JOIN';
		return (this.expr(table), this);
	}

	/**
	 * Creates a left join
	 * 
	 * @param Any table
	 * 
	 * @returns Void
	 */
	left(table) {
		this.TYPE = 'LEFT_JOIN';
		return (this.expr(table), this);
	}

	/**
	 * Creates a right join
	 * 
	 * @param Any table
	 * 
	 * @returns Void
	 */
	right(table) {
		this.TYPE = 'RIGHT_JOIN';
		return (this.expr(table), this);
	}

	/**
	 * Creates an inner join
	 * 
	 * @param Any table
	 * 
	 * @returns Void
	 */
	inner(table) {
		this.TYPE = 'INNER_JOIN';
		return (this.expr(table), this);
	}

	/**
	 * Creates a cross join
	 * 
	 * @param Any table
	 * 
	 * @returns Void
	 */
	cross(table) {
		this.TYPE = 'CROSS_JOIN';
		return (this.expr(table), this);
	}

	/**
	 * Adds a condition
	 * 
	 * @param Array assertions
	 * 
	 * @returns this
	 */
	on(...correlations) { return this.build('CORRELATION', correlations, Condition, 'and'); }

	/**
	 * Sets the using clause
	 * 
	 * @param String correlation
	 * 
	 * @returns this
	 */
	using(correlation) { return this.build('CORRELATION', [correlation], Identifier); }

	toJSON() {
		return {
			type: this.TYPE,
			correlation: this.CORRELATION?.toJSON(),
			...super.toJSON(),
		};
	}

	static fromJSON(context, json) {
		const instance = super.fromJSON(context, json);
		if (!instance || !json.type) return;
		if (json?.expr && json.type) instance.TYPE = json.type;
		if (json?.expr && json.correlation) instance.build('CORRELATION', [json.correlation], [Identifier,Condition]);
		return instance;
	}
	
	stringify() {
		return [
			this.TYPE?.replace(/_/, ' ').toUpperCase() || 'JOIN',
			super.stringify(),
			...[ this.CORRELATION instanceof Identifier ? `USING ${ this.CORRELATION }` : `ON ${ this.CORRELATION }` ], 
		].filter(s => s).join(' ');
	}
	
	static parse(context, expr, parseCallback) {
		const [ joinMatch, type, joinSpec ] = expr.match(new RegExp(`^${ this.regex }([\\s\\S]*)$`, 'i')) || [];
		if (!joinMatch) return;
		const { tokens: [ $table, $correlation ], matches } = Lexer.lex(joinSpec, ['\\s+(?:ON|USING)\\s+'], { useRegex:'i' });
		const instance = super.parse(context, $table.trim(), parseCallback);
		instance.TYPE = type.trim().toUpperCase() + '_JOIN';
		if (/USING/i.test(matches[0])) {
			instance.using(parseCallback(instance, $correlation.trim(), [Identifier]));
		} else if (/ON/i.test(matches[0])) {
			instance.on(parseCallback(instance, $correlation.trim(), [Condition,Assertion]));
		}
		return instance;
	}

	/**
	 * @property String
	 */
	static regex = '(INNER\\s+|CROSS\\s+|(?:LEFT|RIGHT)(?:\\s+OUTER)?\\s+)?JOIN';
}
