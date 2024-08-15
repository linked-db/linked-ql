
import Lexer from '../../Lexer.js';
import { _unwrap, _wrapped } from '@webqit/util/str/index.js';
import AssignmentList from './AssignmentList.js';
import Condition from '../../components/Condition.js';
import Assertion from '../../components/Assertion.js';
import Identifier from '../../components/Identifier.js';

export default class OnConflictClause extends AssignmentList {

    /**
	 * Instance properties
	 */
    WHERE_CLAUSE = null;
	CONFLICT_TARGET = [];

	/**
	 * Builds the statement's CONFLICT_TARGET
	 * 
	 * @return this
	 */
	target(...args) { return (this.build('CONFLICT_TARGET', args, Identifier), this); }

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
	 * @return this
	 */
	where(...wheres) { return (this.build('WHERE_CLAUSE', wheres, Condition, 'and'), this); }

	/**
	 * @inheritdoc
	 */
	toJSON() { return { ...super.toJSON(), conflict_target: this.CONFLICT_TARGET.map(c => c.toJSON()), where_clause: this.WHERE_CLAUSE?.toJSON(), }; }

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		const instance = super.fromJSON(context, json);
		if (!instance) return;
		if (json.conflict_target) instance.target(...[].concat(json.conflict_target));
		if (json.where_clause) instance.where(json.where_clause);
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = [];
        if (this.params.dialect === 'mysql') sql.push('ON DUPLICATE KEY UPDATE');
        else { sql.push(`ON CONFLICT ${ this.CONFLICT_TARGET.length ? `(${ this.CONFLICT_TARGET.join(', ') })` : '' } ${ this.ENTRIES.length ? 'DO UPDATE SET' : 'DO NOTHING' }`); }
        sql.push(super.stringify());
		if (this.WHERE_CLAUSE) sql.push('WHERE', this.WHERE_CLAUSE);
		return sql.join(' ');
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ onConflictMatch, conflictTarget, action, updateSpec ] = expr.match(new RegExp(`^${ this.regex }([\\s\\S]*)$`, 'i')) || [];
		if (!onConflictMatch) return;
        if (/DO\s+NOTHING/i.test(action)) return new this(context);
        const [assignmentList, whereSpec] = Lexer.split(updateSpec, ['WHERE'], { ci: true });
        const instance = super.parse(context, assignmentList, parseCallback);
        if (conflictTarget) {
			const conflictTargetKeyComp = Lexer.split(_wrapped(conflictTarget, '(', ')') ? _unwrap(conflictTarget, '(', ')') : conflictTarget, [',']).map(s => parseCallback(instance, s.trim(), [Identifier]));
			instance.target(...conflictTargetKeyComp);
		}
        if (whereSpec) instance.where(parseCallback(instance, whereSpec.trim(), [Condition,Assertion]));
        return instance;
    }

	/**
	 * @property String
	 */
	static regex = 'ON\\s+(?:DUPLICATE\\s+KEY|CONFLICT(?:\\s+([\\s\\S]+))?)\\s+(UPDATE|DO\\s+NOTHING|DO\\s+UPDATE\\s+SET\\s+)';
}