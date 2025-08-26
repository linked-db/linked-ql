import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';
import { _eq } from '../util.js';

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

        transformer = new Transformer((node, defaultTransform, keyHint, { deSugar/* EXCLUSION */, asAggr/* EXCLUSION */, ...$options }) => {

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
            FromItem,
            SelectList,
            SelectItem,
            FromItemAlias,
            SelectItemAlias,
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
        const rhsOperandJson = rhsOperand.jsonfy();
        const fieldSpec = {
            nodeName: SelectItem.NODE_NAME,
            expr: rhsOperandJson,
            alias: { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: rhsOperandMask },
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
                    select_list: { nodeName: SelectList.NODE_NAME, entries: [fieldSpec] },
                    // FROM <rhsTable>
                    from_clause: {
                        nodeName: FromClause.NODE_NAME,
                        entries: [{ nodeName: FromItem.NODE_NAME, expr: rhsTable.jsonfy({ ...$options, deSugar: 0 }) }]
                    },
                    // GROUP BY <rhsOperandMask>
                    group_by_clause: asAggr ? {
                        nodeName: GroupByClause.NODE_NAME,
                        entries: [{ nodeName: GroupingElement.NODE_NAME, expr: { nodeName: ColumnRef1.NODE_NAME, value: rhsOperandMask } }]
                    } : undefined,
                }
            },
            // AS <dimensionID>
            alias: { nodeName: FromItemAlias.NODE_NAME, as_kw: true, value: dimensionID },
            // ON <dimensionID>.<rhsOperandMask> = <lhsOperand>
            condition_clause: {
                nodeName: OnClause.NODE_NAME,
                expr: {
                    nodeName: BinaryExpr.NODE_NAME,
                    operator: '=',
                    left: lhsOperand.jsonfy({ ...$options, deSugar: 0 }, transformer, linkedDb),
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
            joinJson.expr.expr.select_list.entries.push({
                nodeName: SelectItem.NODE_NAME,
                expr: detail,
                alias: { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: selectAlias },
            });

            return {
                nodeName: ColumnRef1.NODE_NAME,
                qualifier: { nodeName: TableRef1.NODE_NAME, value: dimensionID },
                value: selectAlias,
            };
        };

        const selectorDimension = { id: dimensionID, type: 'join', query: joinJson, alias, select, detail };

        selectorDimensions.set(dimensionID, selectorDimension);

        return selectorDimension;
    }

    finalizeSelectorJSON(resultJson, transformer, linkedDb, options) {
        let rewrittenJoinEntries;
        [
            resultJson,
            rewrittenJoinEntries,
        ] = this.preprocessSelectorDimensions(resultJson, transformer, linkedDb, options);
        
        resultJson = {
            ...resultJson,
            join_clauses: resultJson.join_clauses?.slice(0) || [],
        };

        for (const joinJson of rewrittenJoinEntries) {
            const joinNode = registry.JoinClause.fromJSON(joinJson, this.options);
            this._adoptNodes(joinNode);

            const joinJson2 = transformer.transform(joinNode, ($options = options, childTransformer = transformer) => {
                return joinNode.jsonfy({ ...$options, deSugar: 2 }, childTransformer, linkedDb);
            }, null, options);

            resultJson.join_clauses.push(joinJson2);
        }

        return resultJson;
    }

    preprocessSelectorDimensions(resultJson, transformer, linkedDb, options) {

        const selectorDimensions = transformer.statementContext.artifacts.get('selectorDimensions');
        if (!selectorDimensions.size) {
            return [resultJson, []];
        }
        
        if (this.options.dialect === 'postgres' && (this instanceof registry.DeleteStmt || this instanceof registry.UpdateStmt)) {
            if (resultJson.where_clause?.cursor_name) {
                throw new Error(`Deep/Back Refs are currently not supported with a "WHERE CURRENT OF..." statement`);
            }

            const {
                DerivedQuery,
                CompleteSelectStmt,
                SelectList,
                SelectItem,
                FromItemAlias,
                FromClause,
                WhereClause,
                TableRef1,
                BinaryExpr,
                FromItem,
            } = registry;

            const rand = transformer.rand('join');

            // Each table involved in a Deep/BackRef should have a corresponding entry
            // in the "FROM" list where we have the chance to establish our JOIN
            // with a corresponding extra "WHERE" clause that correlates the generated table with the original table

            const tableExpr = resultJson.table_expr;

            const tblAliasOriginal = tableExpr.alias.value;
            const tblAliasOriginal_delim = tableExpr.alias.delim;
            const tblAliasRewrite = `${rand}:${tblAliasOriginal}`;

            const pkConstraint = tableExpr.result_schema.pkConstraint(true);
            const pkColumnRef = pkConstraint?.columns()[0].jsonfy({ toKind: 1 });

            let pgGeneratedFromItem;
            let pgGeneratedWhereClause

            const createCorrelationExpr = (columnRef) => {
                return {
                    nodeName: BinaryExpr.NODE_NAME,
                    left: {
                        ...columnRef, qualifier: {
                            nodeName: TableRef1.NODE_NAME,
                            value: tblAliasOriginal,
                            delim: tblAliasOriginal_delim
                        },
                    },
                    operator: '=',
                    right: {
                        ...columnRef, qualifier: {
                            nodeName: TableRef1.NODE_NAME,
                            value: tblAliasRewrite
                        },
                    },
                };
            };

            let selectItems;
            const createOrPatchAFromEntry = (columnRef) => {
                if (!_eq(columnRef.qualifier.value, tblAliasOriginal, columnRef.qualifier.delim || tblAliasOriginal_delim)) {
                    return columnRef;
                }

                if (!pgGeneratedFromItem) {
                    // Compose:
                    // - ( SELECT [] FROM <tblRefOriginal> )
                    // - AS <tblAliasRewrite>
                    const fromItem = {
                        nodeName: FromItem.NODE_NAME,
                        expr: {
                            nodeName: DerivedQuery.NODE_NAME,
                            expr: {
                                // SELECT <...>
                                nodeName: CompleteSelectStmt.NODE_NAME,
                                select_list: { nodeName: SelectList.NODE_NAME, entries: [] },
                                from_clause: {
                                    // FROM <tblRefOriginal>
                                    nodeName: FromClause.NODE_NAME,
                                    entries: [{
                                        nodeName: FromItem.NODE_NAME,
                                        expr: tableExpr.table_ref,
                                    }],
                                },
                            },
                        },
                        // AS <tblAliasRewrite>
                        alias: { nodeName: FromItemAlias.NODE_NAME, as_kw: true, value: tblAliasRewrite },
                    };

                    selectItems = fromItem.expr.expr.select_list.entries;

                    // Compose:
                    // - WHERE <tblAliasOriginal.colRefOriginal> = <tblAliasRewrite.colRefRewrite>
                    if (pkColumnRef) {
                        selectItems.push({
                            nodeName: SelectItem.NODE_NAME,
                            expr: pkColumnRef,
                        });
                        pgGeneratedWhereClause = {
                            nodeName: WhereClause.NODE_NAME,
                            expr: createCorrelationExpr(pkColumnRef),
                        };
                    }
                    // Declare entry...
                    pgGeneratedFromItem = fromItem;
                }

                // 1. Select the rewritten ref
                if (!selectItems.find((fieldJson) => _eq(fieldJson.expr.value, columnRef.value, fieldJson.expr.delim || columnRef.delim))) {
                    selectItems.push({ nodeName: SelectItem.NODE_NAME, expr: columnRef });
                }

                // 2. Use ewritten ref for correlation in the absence of a primary key
                if (!pkColumnRef) {
                    let whereExpr = createCorrelationExpr(columnRef);
                    if (pgGeneratedWhereClause) {
                        whereExpr = {
                            nodeName: BinaryExpr.NODE_NAME,
                            left: pgGeneratedWhereClause.expr,
                            operator: 'AND',
                            right: whereExpr
                        };
                    }
                    pgGeneratedWhereClause = {
                        nodeName: WhereClause.NODE_NAME,
                        expr: whereExpr,
                    };
                }

                return {
                    ...columnRef,
                    qualifier: { nodeName: TableRef1.NODE_NAME, value: tblAliasRewrite },
                };
            };

            // (1)
            // Rewrite original references to FROM entry references
            const rewrittenJoinEntries = [];
            for (const [, { query: joinJson }] of selectorDimensions) {
                rewrittenJoinEntries.push({
                    ...joinJson,
                    condition_clause: {
                        ...joinJson.condition_clause,
                        expr: {
                            ...joinJson.condition_clause.expr,
                            left: createOrPatchAFromEntry(joinJson.condition_clause.expr.left)
                        },
                    },
                });
            }

            // (2)
            // Inject the "FROM" list generated by createOrPatchAFromEntry()
            const [fromClause, fromClauseClass] = this instanceof registry.DeleteStmt
                ? ['using_clause', 'UsingFromClause']
                : ['pg_from_clause', 'FromClause'];

            if (pgGeneratedFromItem) {
                const fromItemNode = FromItem.fromJSON(pgGeneratedFromItem, this.options);
                this._adoptNodes(fromItemNode);

                resultJson = {
                    ...resultJson,
                    [fromClause]: {
                        nodeName: registry[fromClauseClass].NODE_NAME,
                        entries: (resultJson[fromClause]?.entries || []).concat(
                            fromItemNode.jsonfy(options, transformer, linkedDb)
                        ),
                    },
                    where_clause: !resultJson.where_clause ? pgGeneratedWhereClause : {
                        nodeName: WhereClause.NODE_NAME,
                        expr: {
                            nodeName: BinaryExpr.NODE_NAME,
                            left: pgGeneratedWhereClause.expr,
                            operator: 'AND',
                            right: resultJson.where_clause.expr,
                        },
                    },
                };
            }

            return [
                resultJson,
                rewrittenJoinEntries,
            ];
        }

        return [
            resultJson,
            [...selectorDimensions].map(([, { query: joinJson }]) => joinJson),
        ];
    }
}
