import { AbstractNode } from '../abstracts/AbstractNode.js';

export class CTEBinding extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'CompositeAlias', as: 'alias', assert: true },
            { type: 'keyword', value: 'AS' },
            {
                optional: true,
                dialect: 'postgres',
                syntaxes: [
                    [
                        { type: 'operator', as: 'not_materialized_kw', value: 'NOT', booleanfy: true },
                        { type: 'keyword', value: 'MATERIALIZED', assert: true },
                    ],
                    { type: 'keyword', as: 'materialized', value: 'MATERIALIZED', booleanfy: true },
                ],
            },
            { type: ['DerivedQuery', 'ValuesTableLiteral'], as: 'expr' },
            { type: 'PGSearchClause', as: 'search_clause', optional: true },
            { type: 'PGCycleClause', as: 'cycle_clause', optional: true },
        ];
    }

    /* AST API */

    alias() { return this._get('alias'); }

    notMaterializedKW() { return this._get('not_materialized_kw'); }

    materialized() { return this._get('materialized'); }

    expr() { return this._get('expr'); }

    searchClause() { return this._get('search_clause'); }

    cycleClause() { return this._get('cycle_clause'); }

    /* SCHEMA API */

    ddlSchema() {
        const alias = registry.Identifier.fromJSON({ value: this.alias().value() });
        return this.expr().ddlSchema(transformer).clone({ renameTo: alias }); // DerivedQuery, ValuesTableLiteral
    }
}