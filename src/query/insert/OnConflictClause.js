
import Lexer from '../Lexer.js';
import AssignmentList from './AssignmentList.js';
import Condition from '../select/Condition.js';
import Assertion from '../select/Assertion.js';

export default class OnConflictClause extends AssignmentList {

    /**
	 * Instance properties
	 */
    WHERE_CLAUSE = null;

	/**
	 * Builds the statement's WHERE_CLAUSE
	 * 
	 * .where(
	 * 		c1 => c1.equals('a', 'b').and(
	 * 			c2 => c2.isNull('a')
	 * 		),
	 * 		c3 => c3.lessThan(2, 4)
	 * );
	 * 
	 * @return Void
	 */
	where(...wheres) { return this.build('WHERE_CLAUSE', wheres, Condition, 'and'); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			...super.toJson(),
			where_clause: this.WHERE_CLAUSE?.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		const instance = super.fromJson(context, json);
		if (!instance) return;
		if (json.where_clause) instance.where(json.where_clause);
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = [];
        if (this.params.dialect === 'mysql') sql.push('ON DUPLICATE KEY UPDATE');
        else { sql.push(`ON CONFLICT ${ !this.ENTRIES.length ? 'DO NOTHING' : 'DO UPDATE SET' }`); }
        sql.push(super.stringify());
		if (this.WHERE_CLAUSE) sql.push('WHERE', this.WHERE_CLAUSE);
		return sql.join(' ');
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ onConflictMatch, conflictTarget/* TODO */, action, updateSpec ] = expr.match(new RegExp(`^${ this.regex }([\\s\\S]*)$`, 'i')) || [];
		if (!onConflictMatch) return;
        if (/DO\s+NOTHING/i.test(action)) return new this(context);
        const [assignmentList, whereSpec] = Lexer.split(updateSpec, ['WHERE'], { ci: true });
        const instance = super.parse(context, assignmentList, parseCallback);
        if (whereSpec) instance.where(parseCallback(instance, whereSpec.trim(), [Condition,Assertion]));
        return instance;
    }

	/**
	 * @property String
	 */
	static regex = 'ON\\s+(?:DUPLICATE\\s+KEY|CONFLICT(?:\\s+([\\s\\S]+))?)\\s+(UPDATE|DO\\s+NOTHING|DO\\s+UPDATE\\s+SET\\s+)';
}