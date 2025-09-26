import { MYColumnAutoIncrementModifier } from './MYColumnAutoIncrementModifier.js';
import { ConstraintSchema } from './ConstraintSchema.js';

export class ColumnIdentityConstraint extends ConstraintSchema {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return this.buildSyntaxRules([
			{ type: 'keyword', value: 'GENERATED' },
			{
				syntaxes: [
					{ type: 'keyword', as: 'always_kw', value: 'ALWAYS', booleanfy: true },
					{
						syntax: [
							{ type: 'keyword', as: 'by_default_kw', value: 'BY', booleanfy: true },
							{ type: 'keyword', value: 'DEFAULT', assert: true },
						],
					},
				],
			},
			{
				optional: true,
				syntax: [
					{ type: 'keyword', as: 'as_identity_kw', value: 'AS', booleanfy: true },
					{ type: 'keyword', value: 'IDENTITY', assert: true },
				]
			}
		]);
	}

	/* AST API */

	alwaysKW() { return this._get('always_kw'); }

	byDefaultKW() { return this._get('by_default_kw'); }

	asIdentityKW() { return this._get('as_identity_kw'); }

	/* JSON API */

	jsonfy(options = {}, transformer = null, schemaInference = null) {
		return (options.toDialect || this.options.dialect) === 'mysql'
			? (new MYColumnAutoIncrementModifier).jsonfy(options, transformer, schemaInference)
			: super.jsonfy(options, transformer, schemaInference);
	}
}