import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';

export const SelectorStmtMixin = (Class) => class extends Class {

    get isSelectorStmt() { return true; }

    /* DESUGARING API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (!options.deSugar) return super.jsonfy(options, transformer, linkedDb);

        const {
            ColumnRef1,
            ColumnRef2,
            AggrCallExpr,
            LQBackRefAbstraction,
            LQDeepRef1,
            LQBackRef,
        } = registry;

        transformer = new Transformer((node, defaultTransform, keyHint, { deSugar/* IMPORTANT */, asAggr/* IMPORTANT */, ...$options }) => {

            const isSpecialColumnRef1 = (node) => {
                return node instanceof ColumnRef1
                    && node.qualifier() instanceof LQBackRefAbstraction;
            };

            const specialColumnRef1ToDeepRef = (columnRef) => {
                const lhsOperandJson = columnRef.qualifier().jsonfy();
                const rhsOperandJson = { ...columnRef.jsonfy(), qualifier: undefined, nodeName: ColumnRef2.NODE_NAME };
                const deepRef = LQDeepRef1.fromJSON({
                    left: lhsOperandJson,
                    right: rhsOperandJson
                });
                columnRef.parentNode._adoptNodes(deepRef);
                return deepRef;
            };

            const toAggr = (nodeJson) => {
                return {
                    nodeName: AggrCallExpr.NODE_NAME,
                    name: ($options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAYAGG' : 'JSON_AGG',
                    arguments: [nodeJson],
                };
            };

            // 1. DeSugar special column refs "(fk <~ tbl).col" to deep refs
            if (isSpecialColumnRef1(node)) {
                node = specialColumnRef1ToDeepRef(node);
            }

            // 2. DeSugar deep refs to bare column refs
            if (node instanceof LQDeepRef1) {
                let { select, detail } = this.createSelectorDimension(node, transformer, linkedDb, { ...$options, asAggr });
                const detailJson = asAggr
                    ? toAggr(detail.jsonfy())
                    : detail.jsonfy();
                return select(detailJson);
            }

            // ...and for when we still hit back refs "fk <~ tbl"
            if (node instanceof LQBackRef || node instanceof LQBackRefAbstraction) {
                if (node instanceof LQBackRefAbstraction) {
                    node = node.expr();
                }
                const { alias } = this.createSelectorDimension(node, transformer, linkedDb, $options);
                return alias();
            }

            // Other
            return defaultTransform();

        }, transformer, this/* IMPORTANT */);

        transformer.statementContext.artifacts.set('selectorDimensions', new Map);

        return super.jsonfy(options, transformer, linkedDb);
    }

    createSelectorDimension(LQRef, transformer, linkedDb, { asAggr = false, ...$options } = {}) {
        const { lhsOperand, rhsOperand, rhsTable, detail } = LQRef.resolve(transformer, linkedDb);
        const selectorDimensions = transformer.statementContext.artifacts.get('selectorDimensions');

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

        const $dimensionID = `dimension${asAggr ? '/g' : ''}|${[lhsOperand, rhsOperand, rhsTable].join('|')}`;
        const dimensionID = transformer.statementContext.hash($dimensionID, 'join');

        if (selectorDimensions?.has(dimensionID)) {
            return { ...selectorDimensions.get(dimensionID), detail };
        }

        const rands = new Map;

        // Mask "rhsOperand"
        const rhsOperandMask = transformer.rand('key', rands);
        const rhsOperandJson = {
            ...rhsOperand.jsonfy(),
            ...(rhsOperand instanceof registry.ColumnRef2 ? { nodeName: registry.ColumnRef1.NODE_NAME } : {}),
        };
        const fieldSpec = {
            nodeName: SelectItem.NODE_NAME,
            expr: rhsOperandJson,
            alias: { nodeName: BasicAlias.NODE_NAME, value: rhsOperandMask },
            as_kw: true,
        };

        // Compose:
        // - LEFT JOIN ( SELECT [fieldSpec] FROM <rhsTable> [GROUP BY]? )
        // - AS <dimensionID>
        // - ON <dimensionID>.<rhsOperandMask> = <lhsOperand>
        const joinJson = {
            nodeName: JoinClause.NODE_NAME,
            join_type: 'LEFT',
            expr: {
                nodeName: DerivedQuery.NODE_NAME,
                // SELECT <fieldSpec>
                expr: {
                    nodeName: CompleteSelectStmt.NODE_NAME,
                    select_list: [fieldSpec],
                    // FROM <rhsTable>
                    from_clause: {
                        nodeName: FromClause.NODE_NAME,
                        entries: [{ nodeName: TableAbstraction3.NODE_NAME, expr: rhsTable.jsonfy({ ...$options, deSugar: false }, transformer, linkedDb) }]
                    },
                    // GROUP BY <rhsOperandMask>
                    group_by_clause: asAggr ? {
                        nodeName: GroupByClause.NODE_NAME,
                        entries: [{ nodeName: GroupingElement.NODE_NAME, expr: { nodeName: ColumnRef1.NODE_NAME, value: rhsOperandMask } }]
                    } : undefined,
                }
            },
            // AS <dimensionID>
            as_kw: true,
            alias: { nodeName: CompositeAlias.NODE_NAME, value: dimensionID },
            // ON <dimensionID>.<rhsOperandMask> = <lhsOperand>
            condition_clause: {
                nodeName: OnClause.NODE_NAME,
                expr: {
                    nodeName: BinaryExpr.NODE_NAME,
                    operator: '=',
                    left: lhsOperand.jsonfy({ ...$options, deSugar: false }, transformer, linkedDb),
                    right: {
                        nodeName: ColumnRef1.NODE_NAME,
                        qualifier: { nodeName: TableRef1.NODE_NAME, value: dimensionID },
                        value: rhsOperandMask
                    },
                }
            },
        };

        // Join ALias as Table ref...
        const alias = () => ({ nodeName: TableRef1.NODE_NAME, value: dimensionID });

        // Add entry...
        const select = (detail) => {
            const selectAlias = transformer.rand('ref', rands);
            // Compose:
            // - [...detail] AS <selectAlias>
            joinJson.expr.expr.select_list.push({
                nodeName: SelectItem.NODE_NAME,
                expr: detail,
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

    applySelectorDimensions(resultJson, transformer, linkedDb, options) {
        const selectorDimensions = transformer.statementContext.artifacts.get('selectorDimensions');

        resultJson = {
            ...resultJson,
            join_clauses: resultJson.join_clauses?.slice(0) || [],
        };
        for (const [, { query: joinJson }] of selectorDimensions) {

            const joinNode = registry.JoinClause.fromJSON(joinJson, this.options);
            this._adoptNodes(joinNode);

            const joinJson2 = transformer.transform(joinNode, ($options = options, childTransformer = transformer) => {
                return joinNode.jsonfy($options, childTransformer, linkedDb);
            }, null, options);

            resultJson.join_clauses.push(joinJson2);
        }

        return resultJson;
    }
}
