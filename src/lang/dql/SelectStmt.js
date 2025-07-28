import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';

export class SelectStmt extends AbstractNonDDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: ['CompleteSelectStmt', 'CompositeSelectStmt'], expression: true }; }

    static buildSyntaxRules(part = null) {
        const itemSeparator = { type: 'punctuation', value: ',' };
        const part1 = (extRules = []) => [
            { type: 'keyword', value: 'SELECT' },
            { type: 'DistinctClause', as: 'distinct_clause', optional: true },
            { type: 'SelectElement', as: 'select_list', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
            {
                optional: true,
                syntax: [
                    { type: 'FromClause', as: 'from_clause', autoIndent: true },
                    { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoIndent: true },
					{ type: 'MYPartitionClause', as: 'my_partition_clause', optional: true, autoIndent: true },
                    { type: 'WhereClause', as: 'where_clause', optional: true, autoIndent: true },
                    {
                        optional: true,
                        syntax: [
                            { type: 'GroupByClause', as: 'group_by_clause', autoIndent: true },
                            { type: 'HavingClause', as: 'having_clause', optional: true, autoIndent: true },
                        ],
                    },
                    { type: 'WindowClause', as: 'window_clause', optional: true, autoIndent: true },
                    ...
                    extRules
                ],
            },
        ];
        const part2 = () => [
            { type: 'OrderByClause', as: 'order_by_clause', optional: true, autoIndent: true },
            { type: 'LimitClause', as: 'limit_clause', optional: true, autoIndent: true },
            { type: 'OffsetClause', as: 'offset_clause', optional: true, autoIndent: true },
            { type: 'PGFetchClause', as: 'pg_fetch_clause', optional: true, dialect: 'postgres', autoIndent: true },
            { type: 'ForClause', as: 'for_clause', optional: true, autoIndent: true },
        ];
        if (part === 1) return part1();
        if (part === 2) return part2();
        return part1(part2());
    }
}
