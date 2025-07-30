import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class ColumnFKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'REFERENCES' },
            { type: 'TableRef', as: 'target_table', assert: true },
            {
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'target_columns', arity: 1, itemSeparator },
                autoIndex: true,
            },
            { type: ['MatchRule', 'DeleteRule', 'UpdateRule'], as: 'referential_rules', arity: Infinity, singletons: true },

        ]);
    }

    /* AST API */

    targetTable() { return this._get('target_table'); }

    targetColumns() { return this._get('target_columns'); }

    referentialRules() { return this._get('referential_rules'); }
}