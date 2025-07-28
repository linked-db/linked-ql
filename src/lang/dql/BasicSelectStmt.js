import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { SelectStmt } from './SelectStmt.js';
import { registry } from '../registry.js';

const {
    LQObjectLiteral,
    BasicAlias,
    SelectElement,
} = registry;

export class BasicSelectStmt extends SelectorStmtMixin(
    SelectStmt
) {

    /* SYNTAX RULES */

    static get syntaxRules() { return this.buildSyntaxRules(1); }

    static get syntaxPriority() { return -1; }

    /* Schema API */

    distinctClause() { return this._get('distinct_clause'); }

    selectList() { return this._get('select_list'); }

    fromClause() { return this._get('from_clause'); }

    joinClauses() { return this._get('join_clauses'); }

    whereClause() { return this._get('where_clause'); }

    groupByClause() { return this._get('group_by_clause'); }

    havingClause() { return this._get('having_clause'); }

    windowClause() { return this._get('window_clause'); }

    // -- MySQL

    myPartitionClause() { return this._get('my_partition_clause'); }

    // --------

    get length() { return this.selectList()?.length ?? 0; }

    [Symbol.iterator]() { return (this.selectList() || [])[Symbol.iterator](); }

    /* DESUGARING API */

    jsonfy(options = {}) {
        let resultJson = super.jsonfy(options);

        // Normalize special case LQObjectLiteral
        let selectList;
        if (options.deSugar
            && (selectList = this.selectList()).length === 1
            && selectList[0].expr() instanceof LQObjectLiteral
            && !selectList[0].alias()
        ) {
            // Make pairs of arguments
            const [argPairs] = resultJson.select_list[0].arguments.reduce(([argPairs, key], arg) => {
                if (key) return [...argPairs, [{ nodeName: BasicAlias.NODE_NAME, value: key.value }, arg]];
                return [argPairs, arg];
            }, [[]]);
            resultJson = {
                ...resultJson,
                select_list: argPairs.map(([alias, expr]) => ({
                    nodeName: SelectElement.NODE_NAME,
                    expr,
                    alias,
                    as_kw: true,
                }))
            };
        }

        return resultJson;
    }
}