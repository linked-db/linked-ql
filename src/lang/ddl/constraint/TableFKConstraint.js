import { ConstraintSchema } from './ConstraintSchema.js';

export class TableFKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'FOREIGN' },
            { type: 'keyword', value: 'KEY', assert: true },
            {
                type: 'paren_block',
                syntax: { type: 'ColumnNameRef', as: 'columns', arity: { min: 1 }, itemSeparator, assert: true, singletons: 'BY_KEY' },
            },
            { type: 'keyword', value: 'REFERENCES' },
            { type: 'TableRef', as: 'target_table', assert: true },
            {
                dialect: 'postgres',
                optional: true,
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'target_columns', arity: { min: 1 }, itemSeparator, singletons: 'BY_KEY', assert: true },
            },
            {
                dialect: 'mysql',
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'target_columns', arity: { min: 1 }, itemSeparator, singletons: 'BY_KEY', assert: true },
            },
            { type: ['FKMatchRule', 'FKDeleteRule', 'FKUpdateRule'], as: 'referential_rules', arity: Infinity, assert: true, singletons: true },
        ]);
    }

    /* AST API */

    columns() { return this._get('columns'); }

    targetTable() { return this._get('target_table'); }

    targetColumns() { return this._get('target_columns'); }

    referentialRules() { return this._get('referential_rules'); }
}
