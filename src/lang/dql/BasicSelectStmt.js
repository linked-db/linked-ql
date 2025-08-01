import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { SelectStmt } from './SelectStmt.js';
import { registry } from '../registry.js';

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

    /* SCHEMA API */

    querySchemas() {
        const entries = [];
        if (this.fromClause()) {
            for (const fromElement of this.fromClause()) {
                const fromExpr = fromElement.expr(); // TableRef or SubqueryConstructor, etc.
                const alias = fromElement.alias()?.value() || fromExpr.value();
                entries.push([alias, fromExpr]);
            }
        }
        if (this.joinClauses()?.length) {
            // Syntaxes 1 & 3
            for (const fromElement of this.joinClauses()) {
                const fromExpr = fromElement.expr();
                const alias = fromElement.alias()?.value() || fromExpr.value();
                entries.push([alias, fromExpr]);
            }
        }
        return new Map(entries);
    }

    /* DESUGARING API */

    jsonfy(options = {}, superTransformCallback = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, superTransformCallback, linkedDb);

        const {
            LQObjectLiteral,
            BasicAlias,
            SelectElement,
        } = registry;

        // Normalize special case LQObjectLiteral
        let selectList;
        if (options.deSugar
            && (selectList = this.selectList()).length === 1
            && selectList[0].expr() instanceof LQObjectLiteral
            && !selectList[0].alias()
        ) {
            // Make pairs of arguments
            const [argPairs] = resultJson.select_list[0].expr.arguments.reduce(([argPairs, key], arg) => {
                if (key) return [[...argPairs, [{ nodeName: BasicAlias.NODE_NAME, value: key.value }, arg]]];
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