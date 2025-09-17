import { ConstraintSchema } from './ConstraintSchema.js';

export class TablePKConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'PRIMARY' },
            { type: 'keyword', as: '.', value: 'KEY', assert: true },
            {
                type: 'paren_block',
                syntax: { type: 'ColumnRef2', as: 'columns', arity: { min: 1 }, itemSeparator, singletons: 'BY_KEY', assert: true },
                assert: true,
            },
            { type: 'PGIndexParameters', as: 'pg_index_parameters', optional: true, dialect: 'postgres' },
        ]);
    }

    /* AST API */

    columns() { return this._get('columns'); }
    
    pgIndexParameters() { return this._get('pg_index_parameters'); }
}