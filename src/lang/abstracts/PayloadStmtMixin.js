import { Transformer } from '../Transformer.js';
import { WhereClause, WindowSpec } from '../dql/index.js';
import { registry } from '../registry.js';
import { _eq } from '../util.js';

export const PayloadStmtMixin = (Class) => class extends Class {

	get isPayloadStmt() { return true; }

	static morphsTo() { return registry.CTE; }

	/* DESUGARING API */

	jsonfy(options = {}, transformer = null, linkedDb = null) {
		if (!options.deSugar) return super.jsonfy(options, transformer, linkedDb);

		const {
			LQDeepRef2,
			AssignmentExpr,
			DerivedQuery,
			ColumnsConstructor,
			ValuesConstructor,
			TypedRowConstructor,
			RowConstructor,
		} = registry;

		const specials = ['column_list', 'default_values_clause', 'values_clause', 'select_clause'].map((s) => this._get(s));
		const [columnList, defaultValuesClause, valuesClause, selectClause] = specials;
		const hasTopLevelDeepRefs = columnList?.entries().some((c) => c instanceof LQDeepRef2);

		// --- ASSIGNMENT EXPRS ---------------

		const ignoreList = hasTopLevelDeepRefs ? new Set(specials) : new Set;
		transformer = new Transformer((node, defaultTransform, keyHint, { deSugar/* EXCLUSION */, ...$options }) => {

			// IMPORTANT!!! The bellow tells the default jsonfier to ignore the nodes we'll handle manually
			if (ignoreList.has(node)) {
				return; // Exclude in output
			}

			// We want to only desugar AssignmentExpr
			if (!(node instanceof AssignmentExpr)) {
				return defaultTransform();
			}

			// Is this assignment expr from within "on_conflict_clause"?
			const onConflictClauseContext = !!this._get('on_conflict_clause')?.containsNode(node);
			const $$options = { ...$options, onConflictClauseContext };

			// Handle bare assignment exoressions
			if (node.left() instanceof LQDeepRef2) {
				const [[deSugaredLhs], [[deSugaredRhs]]] = this.deSugarPayload(
					[node.left()],
					[[node.right()]],
					transformer,
					linkedDb,
					$$options,
				);
				if (!deSugaredLhs) return; // Exclude in output
				return {
					nodeName: AssignmentExpr.NODE_NAME,
					operator: '=',
					left: deSugaredLhs,
					right: deSugaredRhs,
				};
			}

			// Handle compound assignment exoressions
			if (node.left() instanceof ColumnsConstructor // Postgres
				&& node.left().entries().some((c) => c instanceof LQDeepRef2)) {

				const columnList = node.left().entries();
				let deSugaredLhs,
					deSugaredRhs;

				if (node.right() instanceof RowConstructor/* Still passes even for TypedRowConstructor */) {
					[deSugaredLhs, deSugaredRhs] = this.deSugarPayload(
						columnList,
						[node.right().entries()],
						transformer,
						linkedDb,
						$$options,
					);
					deSugaredRhs = { nodeName: TypedRowConstructor.NODE_NAME/* To be really formal */, entries: deSugaredRhs };
				} else if (node.right() instanceof DerivedQuery) {
					[deSugaredLhs, deSugaredRhs] = this.deSugarPayload(
						columnList,
						node.right().expr(),
						transformer,
						linkedDb,
						$$options,
					);
					deSugaredRhs = { nodeName: DerivedQuery.NODE_NAME, expr: deSugaredRhs };
				} else {
					[deSugaredLhs, deSugaredRhs] = this.deSugarPayload(
						columnList,
						[[node.right()]],
						transformer,
						linkedDb,
						$$options,
					);
				}

				if (!deSugaredLhs.length) return; // Exclude in output
				return {
					nodeName: AssignmentExpr.NODE_NAME,
					operator: '=',
					left: { nodeName: ColumnsConstructor.NODE_NAME, entries: deSugaredLhs },
					right: deSugaredRhs,
				};
			}

			return defaultTransform();
		}, transformer, this/* IMPORTANT */);

		// Base JSON
		let resultJson = super.jsonfy(options, transformer, linkedDb);

		// --- TOP-LEVEL COLUMNS:VALUES/SELECT ---------------

		// Manually jsonfy these
		if (hasTopLevelDeepRefs) {
			const [deSugaredLhs, deSugaredRhs] = this.deSugarPayload(
				columnList,
				defaultValuesClause || valuesClause?.entries().map((rowSet) => rowSet.entries()) || selectClause,
				transformer,
				linkedDb,
				options,
			);

			resultJson = {
				...resultJson,
				column_list: { nodeName: ColumnsConstructor.NODE_NAME, entries: deSugaredLhs },
			};

			if (defaultValuesClause || valuesClause) {
				const rowsJson = deSugaredRhs.map((rowSetJson) => ({ nodeName: TypedRowConstructor.NODE_NAME/* Most cross-dialect */, entries: rowSetJson }));
				resultJson = {
					...resultJson,
					values_clause: { nodeName: ValuesConstructor.NODE_NAME, entries: rowsJson },
				};
			} else {
				resultJson = { ...resultJson, select_clause: deSugaredRhs };
			}
		}

		return resultJson;
	}

	deSugarPayload(columns, values, transformer, linkedDb, { onConflictClauseContext = false, deSugar, ...$options } = {}) {
		const payloadDimensions = transformer.statementContext.artifacts.get('payloadDimensions');

		const {
			LQDeepRef2,
			TableRef1,
			ColumnRef0,
			ColumnRef2,
			TypedRowConstructor,
			DefaultLiteral,
			SelectStmt,
			CompleteSelectStmt,
			PGDefaultValuesClause,
			SelectList,
			SelectItem,
			FromClause,
			FromItem,
		} = registry;

		const jsonfy = (node, _deSugar = deSugar) => {
			return node.jsonfy({ deSugar: _deSugar, ...$options }, transformer, linkedDb);
		};

		// (1): Columns
		const deSugarColumnsList = (columnList, dimensionsMap) => {
			return columnList.entries().reduce((columnList, columnRef, columnOffset) => {
				if (columnRef instanceof LQDeepRef2) {

					const dimension = this.createPayloadDimension(columnRef, transformer, linkedDb, { onConflictClauseContext, ...$options });
					dimensionsMap.set(columnOffset, dimension);

					if (dimension.type === 'dependency' && dimension.lhsOperandJson) {
						return columnList.concat({
							nodeName: ColumnRef2.NODE_NAME,
							value: dimension.lhsOperandJson.value,
							delim: dimension.lhsOperandJson.delim,
							result_schema: dimension.lhsOperandJson.result_schema,
						});
					}

					return columnList;
				}

				return columnList.concat(jsonfy(columnRef));
			}, []);
		};

		// (2.a): Default Values
		const deSugarValuesFromDefaultValues = (defaultValuesClause, dimensionsMap) => {
			const valuesRow = columnList.entries().reduce((valuesRow, columnRef, columnOffset) => {
				const valueJson = dimensionsMap.has(columnOffset)
					? dimensionsMap.get(columnOffset).offload(defaultValuesClause)
					: { nodeName: DefaultLiteral.NODE_NAME };

				return valueJson
					? valuesRow.concat(valueJson)
					: valuesRow;
			}, []);

			return [valuesRow];
		};

		// (2.b): Values
		const deSugarValuesFromValues = (valuesEntries, dimensionsMap) => {
			return valuesEntries.map((valuesRow, rowOffset) => {
				return valuesRow.reduce((valuesRow, valueNode, columnOffset) => {
					const valueJson = dimensionsMap.has(columnOffset)
						? dimensionsMap.get(columnOffset).offload(valueNode, rowOffset)
						: jsonfy(valueNode);

					return valueJson
						? valuesRow.concat(valueJson)
						: valuesRow;
				}, []);
			});
		};

		// (2.c): Select
		const deSugarValuesFromSelect = (selectStmt, dimensionsMap) => {
			// Declare base SELECT and select list
			let baseSelect = jsonfy(selectStmt, Infinity);
			let baseSelectItems = baseSelect.select_list.entries;

			if (baseSelectItems.length !== columns.length) {
				throw new Error(`Select list length (${baseSelectItems.length}) does not match columns length (${columns.length})`);
			}

			// Create a CTE entry?
			if (!onConflictClauseContext) {
				const cteAlias = transformer.rand('cte');

				const cteSelect = {
					...baseSelect,
					uuid: cteAlias,
					select_list: {
						nodeName: SelectList.NODE_NAME,
						entries: [{ nodeName: SelectItem.NODE_NAME, expr: { nodeName: ColumnRef0.NODE_NAME, value: '*' } }],
					},
				};
				payloadDimensions
					?.add({ type: 'memo', query: cteSelect });

				// Use that as new base
				const newBaseSelectFromItem = { nodeName: FromItem.NODE_NAME, expr: { nodeName: TableRef1.NODE_NAME, value: cteAlias } };
				baseSelect = {
					nodeName: CompleteSelectStmt.NODE_NAME,
					from_clause: { nodeName: FromClause.NODE_NAME, entries: [newBaseSelectFromItem] }
				};
			}

			// Resolve base select list
			const newBaseSelectList = baseSelectItems.reduce((selectList, fieldJson, columnOffset) => {
				if (dimensionsMap.has(columnOffset)) {
					let subSelectItems;

					if (fieldJson.expr.nodeName === TypedRowConstructor.NODE_NAME) {
						subSelectItems = fieldJson.expr.entries.map((f) => ({ nodeName: SelectItem.NODE_NAME, expr: f }));
					} else {
						subSelectItems = [{ ...fieldJson, result_schema: undefined }];
					}
					const valueNode = SelectStmt.fromJson({
						...baseSelect,
						select_list: { nodeName: SelectList.NODE_NAME, entries: subSelectItems },
					});

					fieldJson = dimensionsMap.get(columnOffset).offload(valueNode);
					if (fieldJson) {
						return selectList.concat(fieldJson);
					}
				}

				return selectList.concat(fieldJson);
			}, []);

			// The final deSugared query
			return {
				...baseSelect,
				select_list: { nodeName: SelectList.NODE_NAME, entries: newBaseSelectList },
			};
		};

		// Process...
		const dimensionsMap = new Map;
		const deSugaredLhs = deSugarColumnsList(columns, dimensionsMap);

		const deSugaredRhs = values instanceof PGDefaultValuesClause
			? deSugarValuesFromDefaultValues(values, dimensionsMap)
			: (values instanceof SelectStmt
				? deSugarValuesFromSelect(values, dimensionsMap)
				: deSugarValuesFromValues(values, dimensionsMap));

		dimensionsMap.clear();

		return [deSugaredLhs, deSugaredRhs];
	}

	createPayloadDimension(LQRefColumn, transformer, linkedDb, { onConflictClauseContext = false, ...$options } = {}) {
		const { lhsOperand, rhsOperand, rhsTable, detail } = LQRefColumn.resolve(transformer, linkedDb, 2);
		const payloadDimensions = transformer.statementContext.artifacts.get('payloadDimensions');

		const {
			LQDeepRef2,
			LQBackRefAbstraction,
			ReturningClause,
			ColumnRef2,
			ColumnRef1,
			TableRef1,
			SelectList,
			SelectItem,
			SelectItemAlias,
			AssignmentExpr,
			ColumnsConstructor,
			TypedRowConstructor,
			PGDefaultValuesClause,
			RowConstructor,
			ValuesConstructor,
			ValuesTableLiteral,
			DefaultLiteral,
			SelectStmt,
			CompleteSelectStmt,
			DerivedQuery,
			FromItem,
			FromClause,
			SetClause,
			BinaryExpr,
			AggrCallExpr,
			BoolLiteral,
			NumberLiteral,
			UpdateStmt,
		} = registry;

		const jsonfy = (node, deSugar = 0) => {
			return node.jsonfy({ deSugar, ...$options }, transformer, linkedDb);
		};

		const $dimensionID = `dimension${onConflictClauseContext ? '/c' : ''}|${[lhsOperand, rhsOperand, rhsTable].join('|')}`;
		const dimensionID = transformer.statementContext.hash($dimensionID, 'cte');

		const rands = new Map;

		const lhsOperandJson = lhsOperand.jsonfy($options, transformer, linkedDb);
		const rhsOperandJson = rhsOperand.jsonfy($options, transformer, linkedDb);
		const rhsTableJson = rhsTable.jsonfy($options, transformer, linkedDb);

		// Figure the expected payload structure
		let columnsConstructorJson;
		if (detail instanceof ColumnsConstructor) {
			columnsConstructorJson = jsonfy(detail);
		} else if (detail instanceof ColumnRef2 || detail instanceof LQDeepRef2) {
			columnsConstructorJson = { nodeName: ColumnsConstructor.NODE_NAME, entries: [jsonfy(detail)] };
		} else {
			throw new Error(`Invalid columns spec: ${LQRefColumn}`);
		}

		// Payload structure length validity
		const columnsLength = columnsConstructorJson.entries.length;
		const dimensionValidateRowLength = (rowNode) => {
			let rowLength = 1;
			if (rowNode instanceof DerivedQuery) {
				rowLength = rowNode.expr().length;
			} else if (rowNode instanceof SelectStmt) {
				rowLength = rowNode.length;
			} else if (rowNode instanceof TypedRowConstructor) {
				rowLength = rowNode.length;
			}
			if (rowLength > columnsLength) throw new Error(`INSERT has more expressions than target columns`);
			if (rowLength < columnsLength) throw new Error(`INSERT has more target columns than expressions`);
			return rowNode;
		};

		// Compose:
		// - (SELECT <sourceCol> ->> <sourceRowIndex> FROM <sourceUuid>)
		const createForeignBinding = (sourceUuid, sourceCol, sourceRowIndex = null, innerFilter = null) => {
			let whereExpr = {
				nodeName: BinaryExpr.NODE_NAME,
				left: { nodeName: ColumnRef1.NODE_NAME, value: '$:index', delim: sourceCol.delim },
				operator: '=',
				right: { nodeName: NumberLiteral.NODE_NAME, value: sourceRowIndex + 1 },
			};

			if (typeof innerFilter === 'string') {
				whereExpr = {
					nodeName: BinaryExpr.NODE_NAME,
					left: whereExpr,
					operator: 'AND',
					right: {
						nodeName: BinaryExpr.NODE_NAME,
						operator: 'IS',
						left: { nodeName: ColumnRef1.NODE_NAME, value: innerFilter },
						right: { nodeName: BoolLiteral.NODE_NAME, value: 'TRUE' },
					},
				};
			}

			const tableSpec = {
				nodeName: FromItem.NODE_NAME,
				expr: { nodeName: TableRef1.NODE_NAME, value: `${sourceUuid}:indices` },
			};

			const selectStmt = {
				nodeName: CompleteSelectStmt.NODE_NAME,
				select_list: { nodeName: SelectList.NODE_NAME, entries: [{ nodeName: SelectItem.NODE_NAME, expr: { ...sourceCol, qualifier: undefined } }] },
				from_clause: { nodeName: FromClause.NODE_NAME, entries: [tableSpec] },
				where_clause: { nodeName: WhereClause.NODE_NAME, expr: whereExpr },
			};

			return { nodeName: DerivedQuery.NODE_NAME, expr: selectStmt };
		};

		// --- UPDATE -------------

		if (this instanceof UpdateStmt || onConflictClauseContext) {

			// UPDATE t1 SET (a, (fk <~ fk <~ t2) ~> (a, b)) = ROW(2, ROW(44, 33))
			// UPDATE t1 SET (a, (fk <~ fk <~ t2) ~> a) = ROW(2, ROW(44, 33))
			// UPDATE t1 SET (a, (fk <~ fk <~ t2) ~> a) = (SELECT a, b FROM t3)
			// UPDATE t1 SET (a, fk ~> fk ~> (a, b)) = ROW(2, ROW(44, 33))
			// UPDATE t1 SET (a, fk ~> fk ~> a) = ROW(2, ROW(44, 33))
			// UPDATE t1 SET (a, fk ~> fk ~> a) = (SELECT a, b FROM t3)

			// Here we want to compose:
			// - WHERE <rhsOperandJson> IN (SELECT <lhsOperandJson> FROM <this.uuid> [WHERE <on_conflict_updated_status> IS TRUE]? )
			const onConflictUpdatedStatusAlias = onConflictClauseContext
				? `${this.uuid}_on_conflict_updated_status` : null;

			const whereClause = {
				nodeName: BinaryExpr.NODE_NAME,
				left: rhsOperandJson,
				operator: 'IN',
				right: createForeignBinding(this.uuid, lhsOperandJson, null, onConflictUpdatedStatusAlias),
			};

			const query = {
				uuid: transformer.rand('cte', rands),
				nodeName: UpdateStmt.NODE_NAME,
				tables: [{ nodeName: FromItem.NODE_NAME, expr: rhsTableJson }],
				set_clause: { nodeName: SetClause.NODE_NAME, entries: [] },
				where_clause: whereClause,
			};

			const offload = (payload) => {
				if (payload instanceof ValuesTableLiteral) {
					throw new Error(`Single-row payload structure expected for column structure: ${detail}. Recieved ${payload.NODE_NAME}.`);
				}
				if (query.set_clause.entries.length) {
					throw new Error(`Unexpected multiple offload() call on ${LQRefColumn}`);
				}

				if (!(payload instanceof PGDefaultValuesClause)) {
					dimensionValidateRowLength(payload);
				}

				let payloadJson = jsonfy(payload);

				if (payload instanceof SelectStmt) {
					payloadJson = { nodeName: DerivedQuery.NODE_NAME, expr: payloadJson };
				} else if (!(payload instanceof RowConstructor)) {
					payloadJson = { nodeName: TypedRowConstructor.NODE_NAME/* most formal */, entries: [payloadJson] };
				}

				query.set_clause.entries.push({
					nodeName: AssignmentExpr.NODE_NAME,
					left: columnsConstructorJson,
					operator: '=',
					right: payloadJson,
				});
			};

			const payloadDimension = {
				id: dimensionID,
				type: 'dependent',
				query,
				offload,
				lhsOperandJson,
				onConflictClauseContext
			};

			payloadDimensions
				?.add(payloadDimension);

			return payloadDimension;
		}

		// --- INSERT/UPSERT -------------

		const query = {
			uuid: transformer.rand('cte', rands),
			nodeName: this.NODE_NAME,
			table_ref: rhsTableJson,
			column_list: columnsConstructorJson,
			values_clause: { nodeName: ValuesConstructor.NODE_NAME, entries: [] },
		};

		const dimensionPushRow = (payload, fKBindingJson = null) => {
			if (payload instanceof PGDefaultValuesClause) {
				if (fKBindingJson) {
					const lastIndex = columnsConstructorJson.length - 1;

					query.values_clause.entries.push({
						nodeName: TypedRowConstructor.NODE_NAME/* most formal */,
						entries: columnsConstructorJson.map((c, i) => {
							return i === lastIndex
								? fKBindingJson
								: { nodeName: DefaultLiteral.NODE_NAME };
						}),
					});
				} else {
					delete query.values_clause;
					query.default_values_clause = jsonfy(payload);
				}
			} else {
				dimensionValidateRowLength(payload);
				const rowJson = payload instanceof RowConstructor
					? jsonfy(payload)
					: { nodeName: TypedRowConstructor.NODE_NAME/* most formal */, entries: [jsonfy(payload)] };

				if (fKBindingJson) {
					query.values_clause.entries.push({ ...rowJson, entries: rowJson.entries.concat(fKBindingJson) });
				} else query.values_clause.entries.push(rowJson);
			}
		};

		if (LQRefColumn.left() instanceof LQBackRefAbstraction) {

			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> (a, b)) VALUES (2, ROW(44, 33)), (3, ROW(11, 22))
			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> a) VALUES (2, 44), (3, 11)
			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> a) SELECT a, b FROM t3

			query.column_list.entries.push(rhsOperandJson);

			const offload = (payload, rowOffset) => {
				const fKBindingJson = createForeignBinding(this.uuid, lhsOperandJson, rowOffset);

				if (payload instanceof SelectStmt) {
					const selectJson = jsonfy(payload, true);
					dimensionValidateRowLength(selectJson.result_schema);

					delete query.values_clause;

					const fkField = {
						nodeName: SelectItem.NODE_NAME,
						expr: fKBindingJson,
						alias: rhsOperand instanceof ColumnRef2
							? { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: rhsOperand.value(), delim: rhsOperand._get('delim') }
							: undefined,
					};

					query.select_clause = {
						...selectJson,
						select_list: { nodeName: SelectList.NODE_NAME, entries: selectJson.select_list.entries.concat(fkField) },
					};
					return;
				}

				if (payload instanceof ValuesTableLiteral) {
					for (const rowNode of payload.entries()) {
						dimensionPushRow(rowNode, fKBindingJson);
					}
				} else dimensionPushRow(payload, fKBindingJson);
			};

			const payloadDimension = {
				id: dimensionID,
				type: 'dependent',
				query,
				offload,
				lhsOperandJson,
			};

			payloadDimensions
				?.add(payloadDimension);

			return payloadDimension;
		}

		// INSERT INTO t1 (a, t2 ~> fk ~> (a, b)) VALUES (2, ROW(44, 33)), (3, ROW(11, 22))
		// INSERT INTO t1 (a, t2 ~> fk ~> a) VALUES (2, 44), (3, 11)
		// INSERT INTO t1 (a, t2 ~> fk ~> a) SELECT a, b FROM t3

		const rhsOperand1Json = { ...rhsOperandJson, nodeName: ColumnRef1.NODE_NAME };

		query.returning_clause = {
			nodeName: ReturningClause.NODE_NAME,
			entries: [{ nodeName: SelectItem.NODE_NAME, expr: rhsOperand1Json }],
		};

		const offload = (payload, rowOffset) => {
			if (payload instanceof ValuesTableLiteral) {
				throw new Error(`Single-row payload structure expected for column structure: ${LQRefColumn.right()}. Recieved ${payload.NODE_NAME}.`);
			}

			if (payload instanceof SelectStmt) {
				const selectJson = jsonfy(payload, true);
				dimensionValidateRowLength(selectJson.result_schema);

				delete query.values_clause;

				query.select_clause = selectJson;
			} else dimensionPushRow(payload);

			// The binding element...
			const rhsOperandPKJson = { nodeName: ColumnRef1.NODE_NAME, value: rhsOperand.value(), delim: rhsOperand._get('delim') };
			const fKBindingJson = createForeignBinding(query.uuid, rhsOperandPKJson, rowOffset);

			return fKBindingJson;
		};

		const payloadDimension = {
			id: dimensionID,
			type: 'dependency',
			query,
			offload,
			lhsOperandJson,
			rhsOperandJson: rhsOperand1Json
		};

		payloadDimensions
			?.add(payloadDimension);

		return payloadDimension;
	}

	finalizeJSON(resultJson, transformer, linkedDb, options) {
		resultJson = super.finalizeJSON(resultJson, transformer, linkedDb, options);

		if (resultJson.returning_clause) {
			// 1. Re-resolve output list for cases of just-added deep refs in returning_clause
			// wherein schemas wouldn't have been resolvable at the time
			// 2. Finalize output list for the last time, honouring given deSugaring level with regards to star selects "*"
			// and ofcos finalize output schemas
			const returningClauseJson = this.returningClause().finalizeJSON(resultJson.returning_clause, transformer, linkedDb, options);
			// Apply now
			resultJson = {
				...resultJson,
				returning_clause: returningClauseJson,
				result_schema: returningClauseJson.result_schema,
			};
		} else {
			resultJson = {
				...resultJson,
				result_schema: registry.JSONSchema.fromJSON({ entries: [] }),
			};
		}

		const payloadDimensions = transformer.statementContext.artifacts.get('payloadDimensions');
		if (!payloadDimensions.size) return resultJson;

		const {
			ColumnRef0,
			ColumnRef1,
			TableRef1,
			FromItem,
			FromClause,
			AggrCallExpr,
			ReturningClause,
			SelectList,
			SelectItem,
			SelectItemAlias,
			CTE,
			CTEItem,
			CTEItemAlias,
			CompleteSelectStmt,
		} = registry;

		const cte = { nodeName: CTE.NODE_NAME, declarations: [], body: null };

		// Promote a query to a CTEItem
		const toCTEItem = (dimensionID, queryJson, indices = []) => {

			// Desugar query and flatten if itself a CTE
			if (queryJson.nodeName === CTE.NODE_NAME) {
				cte.declarations.push(...queryJson.declarations);
				queryJson = queryJson.body;
			}

			// Compose declaration and add...
			cte.declarations.push({
				nodeName: CTEItem.NODE_NAME,
				alias: { nodeName: CTEItemAlias.NODE_NAME, value: dimensionID },
				expr: queryJson,
			});

			if (!indices.length) return;

			// Compose the "indices" declaration and add...
			const selectItems = indices.map((i) => {
				if (i.alias) {
					// Flip expr/alias
					return {
						...i,
						expr: { ...i.expr, value: i.alias.value, delim: i.alias.delim, qualifier: undefined },
						alias: { ...i.alias, value: i.expr.value, delim: i.expr.delim },
					};
				}
				return {
					...i,
					expr: { ...i.expr, qualifier: undefined },
					alias: { nodeName: SelectItemAlias.NODE_NAME, value: i.expr.value, delim: i.expr.delim },
				};
			});

			const rowNumberExpr = {
				nodeName: SelectItem.NODE_NAME,
				expr: { nodeName: AggrCallExpr.NODE_NAME, name: 'ROW_NUMBER', arguments: [], over_clause: { nodeName: WindowSpec.NODE_NAME } },
				alias: { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: '$:index' },
			};

			const tableSpec = { nodeName: FromItem.NODE_NAME, expr: { nodeName: TableRef1.NODE_NAME, value: dimensionID } };

			cte.declarations.push({
				nodeName: CTEItem.NODE_NAME,
				alias: { nodeName: CTEItemAlias.NODE_NAME, value: `${dimensionID}:indices` },
				expr: {
					nodeName: CompleteSelectStmt.NODE_NAME,
					select_list: { nodeName: SelectList.NODE_NAME, entries: selectItems.concat(rowNumberExpr) },
					from_clause: { nodeName: FromClause.NODE_NAME, entries: [tableSpec] },
				},
			});
		};

		// (1): Process non-dependent entries
		const dependents = [],
			lefts = [];

		let onConflictUpdatedStatusRequired;
		const originalReturningList = resultJson.returning_clause?.entries || [];

		for (const { id: dimensionID, type, query, lhsOperandJson, rhsOperandJson, onConflictClauseContext } of payloadDimensions) {

			// Defer dependents
			if (type === 'dependent') {

				if (!lefts.find((existing) => _eq(existing.expr.value, lhsOperandJson.value))) {
					const fieldExpr = { nodeName: SelectItem.NODE_NAME, expr: lhsOperandJson };
					if (originalReturningList.find((existing) => _eq((existing.alias || existing.expr).value, lhsOperandJson.value))) {
						fieldExpr.alias = { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: transformer.rand('key') };
					}
					lefts.push(fieldExpr);
				}

				if (onConflictClauseContext) {
					onConflictUpdatedStatusRequired = true;
				}

				dependents.push({ id: dimensionID, query });
				continue;
			}

			// Desugar query and flatten if itself a CTE
			toCTEItem(dimensionID, query, [{ nodeName: SelectItem.NODE_NAME, expr: rhsOperandJson }]);
		}

		const newOuterReturningList = [];

		// (2): Rewrite resultJson as a CTEItem?
		if (dependents.length) {

			// Rewrite returning clause
			for (const fieldExpr of originalReturningList) {
				newOuterReturningList.push({ ...fieldExpr, expr: { nodeName: ColumnRef1.NODE_NAME, value: fieldExpr.alias.value, delim: fieldExpr.alias.delim } });
			}

			// Compose binding and add...
			const cteReturningClause = {
				nodeName: ReturningClause.NODE_NAME,
				entries: [...originalReturningList, ...lefts],
			};

			if (onConflictUpdatedStatusRequired) {
				const onConflictUpdatedStatusAlias = `${this.uuid}_on_conflict_updated_status`;
				// TODO
			}

			toCTEItem(this.uuid, { ...resultJson, returning_clause: cteReturningClause }, lefts);

			// Process dependents... after having done the above
			for (const { id: dimensionID, query } of dependents) {
				toCTEItem(dimensionID, query);
			}

			// Derive final body...
			let selectItems = newOuterReturningList;

			if (!selectItems.length) {
				selectItems = [{
					nodeName: SelectItem.NODE_NAME,
					expr: { nodeName: AggrCallExpr.NODE_NAME, name: 'COUNT', arguments: [{ nodeName: ColumnRef0.NODE_NAME, value: '*' }] },
					alias: { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: 'COUNT' },
				}];
			}

			const tableSpec = { nodeName: FromItem.NODE_NAME, expr: { nodeName: TableRef1.NODE_NAME, value: this.uuid } };

			cte.body = {
				nodeName: CompleteSelectStmt.NODE_NAME,
				select_list: { nodeName: SelectList.NODE_NAME, entries: selectItems },
				from_clause: { nodeName: FromClause.NODE_NAME, entries: [tableSpec] },
			};
		} else {
			// Use resultJson as-is
			cte.body = resultJson;
		}

		return cte;
	}
}