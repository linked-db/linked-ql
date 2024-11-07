import { Lexer } from '../../Lexer.js';
import { AbstractNode } from '../../AbstractNode.js';
import { WhenClause } from './WhenClause.js';
import { Exprs } from '../grammar.js';

export class CaseConstruct extends AbstractNode {
	
	#switchExpr;
	#cases = [];
	#defaultExpr;

	switchExpr(switchExpr) {
		if (!arguments.length) return this.#switchExpr;
		this.#switchExpr = this.$castInputs([switchExpr], Exprs, this.#switchExpr, 'switchExpr');
		return this;
	}

	cases(...args) {
		if (!arguments.length) return this.#cases.slice();
		this.#cases = this.$castInputs(args, WhenClause, this.#cases, 'cases');
		return this;
	}

	default(defaultExpr) {
		if (!arguments.length) return this.#defaultExpr;
		if (!this.#cases.length) throw new Error(`A "default" expression cannot come before "case" clauses.`);
		this.#defaultExpr = this.$castInputs([defaultExpr], Exprs, this.#defaultExpr, 'defaultExpr');
		return this;
	}

	static get expose() {
		return {
			switch: (context, switchExpr) => this.fromJSON(context, { switchExpr, cases: [] }),
			case: (context, ...cases) => this.fromJSON(context, { cases }),
		};
	}

	static fromJSON(context, json, callback = null) {
		if (!Array.isArray(json?.cases)) return;
		return super.fromJSON(context, json, (instance) => {
			if (json.switchExpr) instance.switchExpr(json.switchExpr);
			instance.cases(...json.cases);
			if (json.defaultExpr) instance.default(json.defaultExpr);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			switchExpr: this.#switchExpr?.jsonfy(options),
			cases: this.#cases.map(c => c.jsonfy(options)),
			defaultExpr: this.#defaultExpr?.jsonfy(options),
			...jsonIn,
		});
	}

	static parse(context, expr, parseCallback) {
		const [caseMatch,caseConstruct] = expr.match(/^CASE\s+([\s\S]*)\s+END(\s+CASE)?$/i) || [];
		if (!caseMatch) return;
		const { tokens: [ switchExpr, ...assertions ], matches: clauses } = Lexer.lex(caseConstruct, ['WHEN','ELSE'], { useRegex: 'i', preserveDelims: true });
		const instance = new this(context);
		// Has given value?
		if (switchExpr.trim()) instance.switchExpr(parseCallback(instance, switchExpr.trim()));
		// On to the cases
		for (const clause of clauses) {
			const assertStmt = assertions.shift();
			if (/ELSE/i.test(clause)) {
				instance.default(parseCallback(instance, assertStmt.replace(/ELSE/i, '').trim()));
			} else if (/WHEN/i.test(clause)) {
				instance.cases(parseCallback(instance, assertStmt.trim(), [WhenClause]));
			} else {
				throw new Error(`Can't have multiple "${ clause }" clauses in a CASE construct.`);
			}
		}
		return instance;
	}
	
	stringify() {
		const sql = [];
		if (this.#switchExpr) sql.push(this.#switchExpr);
		sql.push(...this.#cases);
		if (this.#defaultExpr) sql.push('ELSE', this.#defaultExpr);
		return `CASE ${ sql.join(' ') } END${ this.params.dialect === 'mysql' ? ' CASE' : '' }`;
	}
}