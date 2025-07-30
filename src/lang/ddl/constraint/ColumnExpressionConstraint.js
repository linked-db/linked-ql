import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class ColumnExpressionConstraint extends ConstraintSchema {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return this.buildSyntaxRules([
			{ type: 'keyword', value: 'GENERATED' },
			{ type: 'keyword', value: 'ALWAYS' },
			{ type: 'keyword', value: 'AS' },
			{
                type: 'paren_block',
                syntax: { type: 'Expr', as: 'expr', assert: true },
                autoIndex: true,
            },
			{ type: 'keyword', value: 'STORED', assert: true },
		]);
	}

	/* AST API */

	expr() { return this._get('expr'); }
}