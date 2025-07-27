import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';

export class CTE extends AbstractNonDDLStmt {

    /* SYNTAX RULES */

    static get _bodyTypes() {
        return [
            'SelectStmt',
            'TableStmt',
            'InsertStmt',
            'UpsertStmt',
            'UpdateStmt',
            'DeleteStmt',
            'ValuesConstructor',
        ];
    }

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'WITH' },
            { type: 'keyword', as: 'recursive', value: 'RECURSIVE', booleanfy: true, optional: true },
            { type: 'CTEBinding', as: 'bindings', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
            { type: this._bodyTypes, as: 'body', assert: true, autoSpacing: '\n' },
        ];
    }

    /* AST API */

    recursive() { return this._get('recursive'); }

    bindings() { return this._get('bindings'); }

    body() { return this._get('body'); }
}