import { ConstraintSchema } from './ConstraintSchema.js';
import { registry } from '../../registry.js';

const {
    ColumnSchema,
    ColumnRef2,
} = registry;

export class ColumnFKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'REFERENCES' },
            { type: 'TableRef2', as: 'target_table', assert: true },
            {
                dialect: 'postgres',
                optional: true,
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'target_columns', arity: 1, itemSeparator, singletons: 'BY_KEY', assert: true },
            },
            {
                dialect: 'mysql',
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'target_columns', arity: 1, itemSeparator, singletons: 'BY_KEY', assert: true },
            },
            { type: ['FKMatchRule', 'FKDeleteRule', 'FKUpdateRule'], as: 'referential_rules', arity: Infinity, singletons: true },

        ]);
    }

    /* AST API */

    targetTable() { return this._get('target_table'); }

    targetColumns() { return this._get('target_columns'); }

    referentialRules() { return this._get('referential_rules'); }

    /* API */

    columns() {
        return this.parentNode instanceof ColumnSchema
            ? [ColumnRef2.fromJSON({ value: this.parentNode.name().value() })]
            : [];
    }
}