import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGCycleClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'CYCLE' },
                {
                    assert: true,
                    syntax: [
                        { type: 'ColumnRef1', as: 'column_names', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
                        { type: 'keyword', value: 'SET' },
                        { type: 'ColumnRef1', as: 'mark_col_name' },
                        {
                            optional: true,
                            syntax: [
                                { type: 'keyword', value: 'TO' },
                                { type: 'Expr', as: 'mark_value' },
                                { type: 'keyword', value: 'DEFAULT' },
                                { type: 'Expr', as: 'mark_default' },
                            ]
                        },
                        { type: 'keyword', value: 'USING' },
                        { type: 'ColumnRef1', as: 'path_col_name' },
                    ]
                },
            ]
        };
    }

    /* AST API */

    breadthOrDepthFirst() { return this._get('breadth_or_depth_first'); }

    columnNames() { return this._get('column_names'); }

    markColName() { return this._get('mark_col_name'); }

    markValue() { return this._get('mark_value'); }

    markDefault() { return this._get('mark_default'); }

    pathColName() { return this._get('path_col_name'); }
}