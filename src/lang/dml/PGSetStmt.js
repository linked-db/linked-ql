import { BinaryExpr } from '../expr/op/BinaryExpr.js';

export class PGSetStmt extends BinaryExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'SET' },
                { type: 'identifier', as: 'scope_kw', value: ['LOCAL', 'SESSION'], optional: true },
                {
                    syntaxes: [
                        { type: 'keyword', as: 'left' },
                        { type: 'identifier', as: 'left' },
                    ],
                },
                {
                    optional: true,
                    syntaxes: [
                        { type: 'operator', as: 'operator', value: '=' },
                        { type: 'keyword', as: 'operator', value: 'TO' }
                    ],
                },
                { type: ['Expr', 'KW'], as: 'right', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
            ]
        };
    }

    /* API */

    scopeKW() { return this._get('scope_kw'); }

    /** API */

    jsonfy({ deSugar, ...options } = {}, transformer = null, schemaInference = null) {
        return super.jsonfy(options, transformer, schemaInference);
    }
}