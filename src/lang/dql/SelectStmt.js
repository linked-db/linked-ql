import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { registry } from '../registry.js';

export class SelectStmt extends AbstractNonDDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: ['CompleteSelectStmt', 'CompositeSelectStmt'], expression: true }; }

    static buildSyntaxRules(part = null) {
        const part1 = (extRules = []) => [
            { type: 'keyword', value: 'SELECT' },
            { type: 'DistinctClause', as: 'distinct_clause', optional: true },
            { type: 'SelectList', as: 'select_list' },
            {
                optional: true,
                syntax: [
                    { type: 'FromClause', as: 'from_clause', autoSpacing: '\n' },
                    { type: 'JoinClause', as: 'join_clauses', arity: Infinity, optional: true, autoSpacing: '\n' },
					{ type: 'MYPartitionClause', as: 'my_partition_clause', optional: true, autoSpacing: '\n' },
                    { type: 'WhereClause', as: 'where_clause', optional: true, autoSpacing: '\n' },
                    {
                        optional: true,
                        syntax: [
                            { type: 'GroupByClause', as: 'group_by_clause', autoSpacing: '\n' },
                            { type: 'HavingClause', as: 'having_clause', optional: true, autoSpacing: '\n' },
                        ],
                    },
                    { type: 'WindowClause', as: 'window_clause', optional: true, autoSpacing: '\n' },
                    ...
                    extRules
                ], autoSpacing: '\n',
            },
        ];
        const part2 = () => [
            { type: 'OrderByClause', as: 'order_by_clause', optional: true, autoSpacing: '\n' },
            { type: 'LimitClause', as: 'limit_clause', optional: true, autoSpacing: '\n' },
            { type: 'OffsetClause', as: 'offset_clause', optional: true, autoSpacing: '\n' },
            { type: 'PGFetchClause', as: 'pg_fetch_clause', optional: true, dialect: 'postgres', autoSpacing: '\n' },
            { type: 'ForClause', as: 'for_clause', optional: true, autoSpacing: '\n' },
        ];
        if (part === 1) return part1();
        if (part === 2) return part2();
        return part1(part2());
    }

    dataType() { return registry.DataType.fromJSON({ value: 'SET' }); }
}
