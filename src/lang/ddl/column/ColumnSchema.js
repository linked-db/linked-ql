import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class ColumnSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'ColumnIdent', as: 'name' },
            { type: 'DataType', as: 'data_type' },
            { type: ['ConstraintSchema'], as: 'entries', arity: Infinity, autoIndent: true },

        ];
    }

    /* AST API */

    dataType() { return this._get('data_type'); }
}