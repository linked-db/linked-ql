import { registry } from '../../registry.js';
import { ConstraintSchema } from './ConstraintSchema.js';

export class CheckConstraint extends ConstraintSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return this.buildSyntaxRules([
            { type: 'keyword', value: 'CHECK' },
            {
                type: 'paren_block',
                syntax: { type: 'Expr', as: 'expr', assert: true },
                assert: true,
            },
            { type: 'keyword', as: 'no_inherit_kw', value: 'NO INHERIT', optional: true }
        ]);
    }

    /* AST API */

    expr() { return this._get('expr'); }

    noInheritKW() { return this._get('no_inherit_kw'); }

    /* API */

    columns() {
        const columns = [];
        this.expr()?.walkTree((node) => {
            if (node instanceof registry.ColumnRef1) {
                columns.push(registry.ColumnRef2.fromJSON({ value: node.value() }))
            } else return node;
        });
        return columns;
    }
}