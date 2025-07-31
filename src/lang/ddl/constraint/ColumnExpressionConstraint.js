import { ConstraintSchema } from './ConstraintSchema.js';

export class ColumnExpressionConstraint extends ConstraintSchema {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return this.buildSyntaxRules([
			{
				dialect: 'postgres',
				syntax: [
					{ type: 'keyword', value: 'GENERATED' },
					{ type: 'keyword', value: 'ALWAYS' },
					{ type: 'keyword', value: 'AS' },
					{
						type: 'paren_block',
						syntax: { type: 'Expr', as: 'expr', assert: true },
					},
					{ type: 'keyword', as: 'stored', value: 'STORED', assert: true },
				],
			},
			{
				dialect: 'mysql',
				syntax: [
					{
						optional: true,
						syntax: [
							{ type: 'keyword', as: 'my_generated_kw', value: 'GENERATED', booleanfy: true },
							{ type: 'keyword', value: 'ALWAYS' },
						],
					},
					{ type: 'keyword', value: 'AS' },
					{
						type: 'paren_block',
						syntax: { type: 'Expr', as: 'expr', assert: true },
					},
					{ type: 'keyword', as: 'stored', value: ['STORED', 'VIRTUAL'], optional: true },
				],
			},
		]);
	}

	/* AST API */

	myGeneratedKW() { return this._get('my_generated_kw'); }

	expr() { return this._get('expr'); }

	stored() { return this._get('stored'); }
}