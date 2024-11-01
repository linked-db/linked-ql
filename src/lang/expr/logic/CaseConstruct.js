import { Lexer } from '../../Lexer.js';
import { AbstractNode } from '../../AbstractNode.js';
import { WhenClause } from './WhenClause.js';
import { Exprs } from '../grammar.js';

export class CaseConstruct extends AbstractNode {
	
	#subject;
	#whenClauses = [];
	#elseClause;

	subject(subject) {
		if (!arguments.length) return this.#subject;
		if (this.#whenClauses.length || this.#elseClause) throw new Error(`A "case" clause must come before any "when" or "else" clauses.`);
		this.#subject = this.$castInputs([subject], Exprs, this.#subject, 'case_value');
		return this;
	}

	whenClauses(...args) {
		if (!arguments.length) return this.#whenClauses.slice();
		if (this.#elseClause) throw new Error(`A "when" clause cannot come after an "else" clause.`);
		this.#whenClauses = this.$castInputs(args, WhenClause, this.#whenClauses, 'when_clauses');
		return this;
	}

	else(elseExpr) {
		if (!arguments.length) return this.#elseClause;
		if (!this.#whenClauses.length) throw new Error(`An "else" clause cannot come before "when" clauses.`);
		this.#elseClause = this.$castInputs([elseExpr], Exprs, this.#elseClause, 'else_clause');
		return this;
	}

	static get expose() {
		return {
			caseFor: (context, subject, ...whenClauses) => this.fromJSON(context, { subject, whenClauses }),
			case: (context, ...whenClauses) => this.fromJSON(context, { whenClauses }),
		};
	}

	static fromJSON(context, json, callback = null) {
		if (!Array.isArray(json?.whenClauses)) return;
		return super.fromJSON(context, json, (instance) => {
			if (json.subject) instance.subject(json.subject);
			for (const clause of json.whenClauses) instance.whenClauses(clause);
			if (json.elseClause) instance.else(json.elseClause);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			subject: this.#subject?.jsonfy(options),
			whenClauses: this.#whenClauses.map(c => c.jsonfy(options)),
			elseClause: this.#elseClause?.jsonfy(options),
			...jsonIn,
		});
	}

	static parse(context, expr, parseCallback) {
		const [caseMatch,caseConstruct] = expr.match(/^CASE\s+([\s\S]*)\s+END(\s+CASE)?$/i) || [];
		if (!caseMatch) return;
		const { tokens: [ subject, ...assertions ], matches: clauses } = Lexer.lex(caseConstruct, ['WHEN','ELSE'], { useRegex: 'i', preserveDelims: true });
		const instance = new this(context);
		// Has given value?
		if (subject.trim()) instance.subject(parseCallback(instance, subject.trim()));
		// On to the cases
		for (const clause of clauses) {
			const assertStmt = assertions.shift();
			if (/ELSE/i.test(clause)) {
				instance.else(parseCallback(instance, assertStmt.replace(/else/i, '').trim()));
			} else if (/WHEN/i.test(clause)) {
				instance.whenClauses(parseCallback(instance, assertStmt.trim(), [WhenClause]));
			} else {
				throw new Error(`Can't have multiple "${ clause }" clauses in a CASE construct.`);
			}
		}
		return instance;
	}
	
	stringify() {
		const sql = [];
		if (this.#subject) sql.push(this.#subject);
		sql.push(...this.#whenClauses);
		if (this.#elseClause) sql.push('ELSE', this.#elseClause);
		return `CASE ${ sql.join(' ') } END${ this.params.dialect === 'mysql' ? ' CASE' : '' }`;
	}
}