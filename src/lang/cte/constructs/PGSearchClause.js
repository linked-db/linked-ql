import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class PGSearchClause extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'SEARCH' },
                {
                    assert: true,
                    syntax: [
                        { type: 'keyword', as: 'breadth_or_depth_first', value: ['BREADTH', 'DEPTH'] },
                        { type: 'keyword', value: 'FIRST' },
                        { type: 'keyword', value: 'BY' },
                        { type: 'ColumnRef1', as: 'column_names', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
                        { type: 'keyword', value: 'SET' },
                        { type: 'ColumnRef1', as: 'seq_col_name' },
                    ]
                }
            ]
        };
    }

    /* AST API */

    breadthOrDepthFirst() { return this._get('breadth_or_depth_first'); }

    columnNames() { return this._get('column_names'); }

    seqColName() { return this._get('seq_col_name'); }
}