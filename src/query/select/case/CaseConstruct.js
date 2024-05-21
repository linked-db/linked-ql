
import Lexer from '../../Lexer.js';
import WhenClause from './WhenClause.js';
import Node from '../../abstracts/Node.js';
import Expr from '../abstracts/Expr.js';

export default class CaseConstruct extends Node {
	
	/**
	 * Instance properties
	 */
	BASE_VALUE;
	WHEN_CLAUSES = [];
	ELSE_CLAUSE;

	/**
	 * Sets a given value for the cases.
	 * 
	 * @param Any baseValue
	 * 
	 * @returns this
	 */
	compare(baseValue) {
		if (this.WHEN_CLAUSES.length || this.ELSE_CLAUSE) throw new Error(`A "case" clause must come before any "when" or "else" clauses.`);
		return this.build('BASE_VALUE', [baseValue], Expr.Types);
	}

	/**
	 * Adds a "when" expression
	 * 
	 * @param Any whenExpr
	 * 
	 * @returns WhenClause
	 */
	when(whenExpr) {
		if (this.ELSE_CLAUSE) throw new Error(`A "when" clause cannot come after an "else" clause.`);
		this.build('WHEN_CLAUSES', [whenExpr], WhenClause, 'condition');
		return this.WHEN_CLAUSES[this.WHEN_CLAUSES.length - 1];
	}

	/**
	 * Adds an ELSE clause to the cases.
	 * 
	 * @param Any elseClause
	 * 
	 * @returns this
	 */
	else(elseClause) {
		if (!this.WHEN_CLAUSES.length) throw new Error(`An "else" clause cannot come before "when" clauses.`);
		return this.build('ELSE_CLAUSE', [elseClause], Expr.Types);
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			base_value: this.BASE_VALUE?.toJson(),
			when_clauses: this.WHEN_CLAUSES.map(c => c.toJson()),
			else_clause: this.ELSE_CLAUSE?.toJson(),
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.when_clauses)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		if (json.base_value) instance.compare(json.base_value);
		for (const whenClause of json.when_clauses) instance.when(whenClause);
		if (json.else_clause) instance.else(json.else_clause);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = [];
		if (this.BASE_VALUE) sql.push(this.BASE_VALUE);
		sql.push(`WHEN ${ this.WHEN_CLAUSES.join(' WHEN ') }`);
		if (this.ELSE_CLAUSE) sql.push('ELSE', this.ELSE_CLAUSE);
		return `CASE ${ sql.join(' ') } END${ this.params.dialect === 'mysql' ? ' CASE' : '' }`;
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [caseMatch,caseConstruct] = expr.match(/^CASE\s+([\s\S]*)\s+END(\s+CASE)?$/i) || [];
		if (!caseMatch) return;
		const { tokens: [ baseValue, ...assertions ], matches: clauses } = Lexer.lex(caseConstruct, ['WHEN','ELSE'], { useRegex: 'i' });
		const instance = new this(context);
		// Has given value?
		if (baseValue.trim()) instance.compare(parseCallback(instance, baseValue.trim()));
		// On to the cases
		for (const clause of clauses) {
			const assertStmt = assertions.shift();
			if (/ELSE/i.test(clause)) {
				instance.else(parseCallback(instance, assertStmt.trim()));
			} else if (/WHEN/i.test(clause)) {
				instance.when(parseCallback(instance, assertStmt.trim(), [WhenClause]));
			} else {
				throw new Error(`Can't have multiple "${ clause }" clauses in a CASE construct.`);
			}
		}
		return instance;
	}

	/**
	 * @inheritdocs
	 */
	static factoryMethods = { case: context => new this(context) };
}