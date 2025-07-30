import { ConstraintSchema } from './abstracts/ConstraintSchema.js';

export class CheckConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'CHECK' },
            {
                type: 'paren_block',
                syntax: { type: 'Expr', as: 'expr', assert: true },
                assert: true,
                autoIndex: true,
            },
            { type: 'keyword', as: 'no_inherit_kw', value: 'NO INHERIT', optional: true }
        ]);
    }

    /* AST API */

    expr() { return this._get('expr'); }

    noInheritKW() { return this._get('no_inherit_kw'); }
}