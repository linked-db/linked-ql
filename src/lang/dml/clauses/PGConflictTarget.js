import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGConflictTarget extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntaxes: [
                [
                    { type: 'keyword', value: 'ON' },
                    { type: 'keyword', value: 'CONSTRAINT' },
                    { type: 'Identifier', as: 'constraint_name', assert: true }
                ],
                [
                    {
                        type: 'paren_block',
                        syntax: { type: 'PGConflictTargetIndexSpec', as: 'index_list', arity: { min: 1 }, itemSeparator, assert: true },
                        autoIndent: true,
                    },
                    { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                ],
            ],
        };
    }

    /* AST API */

    constraintName() { return this._get('constraint_name'); }

    indexList() { return this._get('index_list'); }

    whereClause() { return this._get('where_clause'); }
}