import { ColumnRef2, RowConstructor } from '../expr/index.js';
import { registry } from '../registry.js';
import { AbstractNode } from './AbstractNode.js';

export const SelectorStmtMixin = (Class) => class extends Class {

    get isSelectorStmt() { return true; }

    /* DESUGARING API */

    jsonfy(options = {}, linkedContext = null, linkedDb = null) {
        if (!options.deSugar) return super.jsonfy(options, linkedContext, linkedDb);

        const {
            ColumnRef1,
            ColumnRef2,
            AggrCallExpr,
            LQBackRefAbstraction,
            SelectItem,
            BasicAlias,
            LQDeepRef1,
            LQBackRef,
        } = registry;

        const selectorDimensions = new Map;
        const transformCallback = (node, keyHint, { deSugar/* IMPORTANT */, asAggr/* IMPORTANT */, ...$options }) => {
            // Defer to super callback
            if (superTransformCallback) {
                node = superTransformCallback(node, keyHint, { deSugar/* IMPORTANT */, ...$options });
            }

            // Utils

            const toAggr = (nodeJson, wrap = false) => {
                const aggrJson = {
                    nodeName: AggrCallExpr.NODE_NAME,
                    name: ($options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAYAGG' : 'JSON_AGG',
                    arguments: [nodeJson],
                };
                return wrap
                    ? { nodeName: RowConstructor.NODE_NAME, entries: [aggrJson] }
                    : aggrJson;
            };

            const isSpecialColumnRef1 = (node) => {
                return node instanceof ColumnRef1
                    && node.qualifier() instanceof LQBackRefAbstraction;
            };

            const specialColumnRef1ToDeepRef = (columnRef, asAggr = false) => {
                const leftJson = columnRef.qualifier().jsonfy();
                const rightJson = asAggr
                    ? toAggr({ nodeName: ColumnRef1.NODE_NAME, value: columnRef.value() }, true)
                    : { nodeName: ColumnRef2.NODE_NAME, value: columnRef.value() };
                const deepRef = LQDeepRef1.fromJSON({
                    left: leftJson,
                    right: rightJson
                });
                columnRef.parentNode._adoptNodes(deepRef);
                return deepRef;
            };

            const toAggrDeepRef = (deepRef) => {
                const leftJson = deepRef.left().jsonfy();
                const rightJson = deepRef.right() instanceof ColumnRef2
                    ? { nodeName: ColumnRef1.NODE_NAME, value: deepRef.right().value() }
                    : deepRef.right().jsonfy();
                const newDeepRef = LQDeepRef1.fromJSON({
                    left: leftJson,
                    right: toAggr(rightJson, true)
                });
                deepRef.parentNode._adoptNodes(newDeepRef);
                return newDeepRef;
            };

            // 0. DeSugar aggr select elements
            if (deSugar && node instanceof SelectItem) {

                let exprJson;
                const exprNode = node.expr();
                const recurseTransform = (node, $$options = $options) => {
                    const result = transformCallback(node, null, { deSugar/* IMPORTANT */, ...$$options });
                    return result instanceof AbstractNode
                        ? result.jsonfy({ deSugar/* IMPORTANT */, ...$options }, linkedContext, linkedDb)
                        : result;
                };

                if (node.alias()?.isAggr()) {
                    if (exprNode instanceof LQDeepRef1 || isSpecialColumnRef1(exprNode)) {
                        let deepRef;
                        if (exprNode instanceof LQDeepRef1) {
                            deepRef = toAggrDeepRef(exprNode);
                        } else {
                            deepRef = specialColumnRef1ToDeepRef(exprNode, true);
                        }
                        exprJson = recurseTransform(deepRef, { ...$options, asAggr: true });
                    } else {
                        exprJson = toAggr(recurseTransform(exprNode));
                    }
                } else {
                    exprJson = recurseTransform(exprNode);
                }

                // Note the below instead of .jsonfy() as the former would still add the "[]" notation
                const aliasJson = node.alias() && {
                    nodeName: BasicAlias.NODE_NAME,
                    value: node.alias().value()
                };

                return {
                    nodeName: SelectItem.NODE_NAME,
                    expr: exprJson,
                    as_kw: node.asKW(),
                    alias: aliasJson
                };
            }

            // 1. DeSugar special column refs "(fk <~ tbl).col" to deep refs
            if (deSugar && isSpecialColumnRef1(node)) {
                node = specialColumnRef1ToDeepRef(node);
            }

            // 2. DeSugar deep refs to bare column refs
            if (deSugar && node instanceof LQDeepRef1) {
                const { select, detail } = this.createSelectorDimension(node, selectorDimensions, { asAggr, ...$options }, linkedContext, linkedDb);
                return select(detail);
            }

            // ...and for when we still hit back refs "fk <~ tbl"
            if (deSugar && (node instanceof LQBackRef || node instanceof LQBackRefAbstraction)) {
                if (node instanceof LQBackRefAbstraction) {
                    node = node.expr();
                }
                const { alias } = this.createSelectorDimension(node, selectorDimensions, $options, linkedContext, linkedDb);
                return alias();
            }

            // Other
            return node;
        };

        // Jsonfy with transformCallback as visitor
        let resultJson = super.jsonfy(options, linkedContext, linkedDb);

        // Apply selectorDimensions
        if (selectorDimensions.size) {
            resultJson = this.applySelectorDimensions(resultJson, selectorDimensions, options, linkedContext, linkedDb);
        }
        return resultJson;
    }

    createSelectorDimension(LQRef, selectorDimensions = null, { asAggr = false, ...$options } = {}, linkedContext = null, linkedDb = null) {
        const { left, right, table, detail } = LQRef.getOperands(linkedContext, linkedDb);

        const {
            CompleteSelectStmt,
            DerivedQuery,
            FromClause,
            JoinClause,
            OnClause,
            GroupByClause,
            GroupingElement,
            TableAbstraction3,
            SelectItem,
            CompositeAlias,
            BasicAlias,
            TableRef1,
            ColumnRef1,
            BinaryExpr,
        } = registry;

        const $dimensionID = `dimension${asAggr ? '/g' : ''}|${[left, right, table].join('|')}`;
        const dimensionID = this._hash($dimensionID, 'join', $options);
        if (selectorDimensions?.has(dimensionID)) {
            return selectorDimensions.get(dimensionID);
        }

        // Mask "right"
        const rightMask = this._rand('key', $options);
        const rightJson = right.jsonfy({ ...$options, deSugar: false }, linkedContext, linkedDb);
        const fieldSpec = {
            nodeName: SelectItem.NODE_NAME,
            expr: rightJson,
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
                nodeName: DerivedQuery.NODE_NAME,
                // SELECT <fieldSpec>
                expr: {
                    nodeName: CompleteSelectStmt.NODE_NAME,
                    select_list: [fieldSpec],
                    // FROM <table>
                    from_clause: {
                        nodeName: FromClause.NODE_NAME,
                        entries: [{ nodeName: TableAbstraction3.NODE_NAME, expr: table.jsonfy({ ...$options, deSugar: false }, linkedContext, linkedDb) }]
                    },
                    // GROUP BY <rightMask>
                    group_by_clause: asAggr ? {
                        nodeName: GroupByClause.NODE_NAME,
                        entries: [{ nodeName: GroupingElement.NODE_NAME, expr: { nodeName: ColumnRef1.NODE_NAME, value: rightMask } }]
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
                    left: left.jsonfy({ ...$options, deSugar: false }, linkedContext, linkedDb),
                    right: {
                        nodeName: ColumnRef1.NODE_NAME,
                        qualifier: { nodeName: TableRef1.NODE_NAME, value: dimensionID },
                        value: rightMask
                    },
                }
            },
        };

        // Join ALias as Table ref...
        const alias = () => ({ nodeName: TableRef1.NODE_NAME, value: dimensionID });

        // Add entry...
        const select = (detail) => {
            const selectAlias = this._rand('ref', $options);
            // Compose:
            // - [...detail] AS <selectAlias>
            joinJson.expr.expr.select_list.push({
                nodeName: SelectItem.NODE_NAME,
                expr: detail.jsonfy({ ...$options, deSugar: false }, linkedContext, linkedDb),
                alias: { nodeName: BasicAlias.NODE_NAME, value: selectAlias },
                as_kw: true,
            });
            return {
                nodeName: ColumnRef1.NODE_NAME,
                qualifier: { nodeName: TableRef1.NODE_NAME, value: dimensionID },
                value: selectAlias
            };
        };

        const selectorDimension = { id: dimensionID, type: 'join', query: joinJson, alias, select, detail };
        selectorDimensions
            ?.set(dimensionID, selectorDimension);

        return selectorDimension;
    }

    applySelectorDimensions(resultJson, selectorDimensions, options, linkedContext = null, linkedDb = null) {

        const {
            JoinClause,
        } = registry;

        resultJson = {
            ...resultJson,
            join_clauses: resultJson.join_clauses?.slice(0) || [],
        };
        for (const [, { query: joinJson }] of selectorDimensions) {
            const joinInstance = JoinClause.fromJSON(joinJson, this.options);
            this._adoptNodes(joinInstance);
            resultJson.join_clauses.push(
                joinInstance.jsonfy(options, linkedContext, linkedDb)
            );
        }

        return resultJson;
    }
}
