import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGConflictTargetIndexSpec extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    { type: 'ClassicColumnRef', as: 'column_name' },
                    { type: 'paren_block', syntax: { type: 'Expr', as: 'expr', assert: true }, autoIndent: true },
                    { type: 'CallExpr', as: 'expr' }, // Must come after the parens option
                ],
            },
            {
                optional: true,
                syntax: [
                    { type: 'operator', value: 'COLLATE' },
                    { type: 'string_literal', as: 'collation', assert: true },
                ],
            },
            { type: 'Identifier', as: 'opclass', optional: true },
        ];
    }

    /* AST API */

    columnName() { return this._get('column_name'); }

    expr() { return this._get('expr'); }

    collation() { return this._get('collation'); }

    opclass() { return this._get('opclass'); }
}