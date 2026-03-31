import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class ViewSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['TableIdent', 'Identifier'/* to support mock names */], as: 'name' },
            { type: 'RelationSourceExpr', as: 'source_expr' },
        ];
    }

    /* AST API */

    columns() { return this._get('columns') || []; }

    sourceExpr() { return this._get('source_expr'); }
}
