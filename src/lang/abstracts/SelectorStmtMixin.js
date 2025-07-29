import { registry } from '../registry.js';

const {
    // Statement and clause nodes
    CompleteSelectStmt,
    SubqueryConstructor,
    FromClause,
    JoinClause,
    OnClause,
    GroupByClause,

    // Table and field specification
    FromElement,
    SelectElement,

    // Alias nodes
    CompositeAlias,
    BasicAlias,

    // Computed/derived references
    TableAbstractionRef,
    ColumnRef,

    // Expressions
    BinaryExpr,

    // Logical query references
    LQDeepRef,
    LQBackRef,
    LQBackRefConstructor,
} = registry;

export const SelectorStmtMixin = (Class) => class extends Class {

    get isSelectorStmt() { return true; }

    /* DESUGARING API */

    jsonfy(options = {}, superTransformCallback = null, linkedDb = null) {
        if (!options.deSugar) return super.jsonfy(options, superTransformCallback, linkedDb);

        const selectorDimensions = new Map;
        const transformCallback = (node, keyHint, { deSugar/* IMPORTANT */, ...$options }) => {
            // Defer to super callback
            if (superTransformCallback) {
                node = superTransformCallback(node, keyHint, { deSugar/* IMPORTANT */, ...$options });
            }
            // LQDeepRef
            if (deSugar && node instanceof LQDeepRef) {
                const { select } = this.createSelectorDimension(node, selectorDimensions, $options);
                return select(node.right());
            }
            // LQBackRef, LQBackRefConstructor
            if (deSugar && (node instanceof LQBackRef || node instanceof LQBackRefConstructor)) {
                if (node instanceof LQBackRefConstructor) {
                    node = node.expr();
                }
                const { alias } = this.createSelectorDimension(node, selectorDimensions, $options);
                return alias();
            }
            // Other
            return node;
        };

        // Jsonfy with transformCallback as visitor
        let resultJson = super.jsonfy(options, transformCallback, linkedDb);

        // Apply selectorDimensions
        if (selectorDimensions.size) {
            resultJson = this.applySelectorDimensions(resultJson, selectorDimensions, options);
        }
        return resultJson;
    }

    createSelectorDimension(LQRef, selectorDimensions = null, { asAggr = false, ...$options } = {}) {
        const { left, right, table } = LQRef.getOperands();
        
        const dimensionID = `dimension${asAggr ? '/g' : ''}::${[left, right, table].join('/')}`;
        if (selectorDimensions?.has(dimensionID)) {
            return selectorDimensions.get(dimensionID);
        }

        // Mask "right"
        const rightMask = this._rand('rand');
        const fieldSpec = {
            nodeName: SelectElement.NODE_NAME,
            expr: right.jsonfy/* @case1 */($options, null, linkedDb),
            alias: { nodeName: BasicAlias.NODE_NAME, value: rightMask },
            as_kw: true,
        };

        // Compose:
        // - LEFT JOIN ( SELECT [fieldSpec] FROM <table> [GROUP BY]? )
        // - AS <dimensionID>
        // - ON <dimensionID>.<rightMask> = <left>
        const joinJson = {
            nodeName: JoinClause.NODE_NAME,
            join_type: 'LEFT',
            expr: {
                nodeName: SubqueryConstructor.NODE_NAME,
                // SELECT <fieldSpec>
                expr: {
                    nodeName: CompleteSelectStmt.NODE_NAME,
                    select_list: [fieldSpec],
                    // FROM <table>
                    from_clause: {
                        nodeName: FromClause.NODE_NAME,
                        entries: [{ nodeName: FromElement.NODE_NAME, expr: table.jsonfy/* @case1 */($options, null, linkedDb) }]
                    },
                    // GROUP BY <rightMask>
                    group_by_clause: asAggr ? {
                        nodeName: GroupByClause.NODE_NAME,
                        entries: [{ nodeName: ColumnRef.NODE_NAME, value: rightMask }]
                    } : undefined,
                }
            },
            // AS <dimensionID>
            as_kw: true,
            alias: { nodeName: CompositeAlias.NODE_NAME, value: dimensionID },
            // ON <dimensionID>.<rightMask> = <left>
            condition_clause: {
                nodeName: OnClause.NODE_NAME,
                expr: {
                    nodeName: BinaryExpr.NODE_NAME,
                    operator: '=',
                    left: left.jsonfy/* @case1 */($options, null, linkedDb),
                    right: {
                        nodeName: ColumnRef.NODE_NAME,
                        qualifier: { nodeName: TableAbstractionRef.NODE_NAME, value: dimensionID },
                        value: rightMask
                    },
                }
            },
        };

        // Join ALias as Table ref...
        const alias = () => ({ nodeName: TableAbstractionRef.NODE_NAME, value: dimensionID });

        // Add entry...
        const select = (detail) => {
            const selectAlias = this._rand('ref');
            // Compose:
            // - [...detail] AS <selectAlias>
            joinJson.expr.expr.select_list.push({
                nodeName: SelectElement.NODE_NAME,
                expr: detail.jsonfy/* @case1 */($options, null, linkedDb),
                alias: { nodeName: BasicAlias.NODE_NAME, value: selectAlias },
                as_kw: true,
            });
            return {
                nodeName: ColumnRef.NODE_NAME,
                qualifier: { nodeName: TableAbstractionRef.NODE_NAME, value: dimensionID },
                value: selectAlias
            };
        };

        const selectorDimension = { id: dimensionID, type: 'join', query: joinJson, alias, select };
        selectorDimensions
            ?.set(dimensionID, selectorDimension);

        return selectorDimension;
    }

    applySelectorDimensions(resultJson, selectorDimensions, options) {
        resultJson = {
            ...resultJson,
            join_clauses: resultJson.join_clauses?.slice(0) || [],
        };
        for (const [, { query: joinJson }] of selectorDimensions) {
            resultJson.join_clauses.push(
                JoinClause.fromJSON(joinJson, this.options).jsonfy/* @case2 */(options, null, linkedDb)
            );
        }
        return resultJson;
    }
}