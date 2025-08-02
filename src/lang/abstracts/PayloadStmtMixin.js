import { _eq } from '../util.js';
import { registry } from '../registry.js';

export const PayloadStmtMixin = (Class) => class extends Class {

	get isPayloadStmt() { return true; }

	static morphsTo() { return registry.CTE; }

	/* DESUGARING API */

	jsonfy(options = {}, superTransformCallback = null, linkedDb = null) {
		if (!options.deSugar) return super.jsonfy(options, superTransformCallback, linkedDb);

		const {
			LQDeepRef,
			AssignmentExpr,
			SubqueryConstructor,
			ColumnsConstructor,
			ValuesConstructor,
			RowConstructor,
			SetConstructor,
		} = registry;

		const payloadDimensions = new Set;

		const specials = ['columns_list', 'default_values_clause', 'values_clause', 'select_clause'].map((s) => this._get(s));
		const [columnsList, defaultValuesClause, valuesClause, selectClause] = specials;
		const hasTopLevelDeepRefs = columnsList?.some((c) => c instanceof LQDeepRef);

		// --- ASSIGNMENT EXPRS ---------------

		const ignoreList = hasTopLevelDeepRefs ? new Set(specials) : new Set;
		const transformCallback = (node, keyHint, { deSugar/* IMPORTANT */, ...$options }) => {
			// Defer to super callback first
			if (superTransformCallback) {
				node = superTransformCallback(node, keyHint, { deSugar/* IMPORTANT */, ...$options });
			}

			// IMPORTANT!!! The bellow tells the default jsonfier to ignore the nodes we'll handle manually
			if (ignoreList.has(node)) return; // Exclude in output
			// We want to only desugar AssignmentExpr
			if (!(deSugar && node instanceof AssignmentExpr)) return node; // Default jsonfy

			// Is this assignment expr from within "on_conflict_clause"?
			const onConflictClauseContext = !!this._get('on_conflict_clause')?.containsNode(node);
			const $$options = { ...$options, onConflictClauseContext };

			// Handle bare assignment exoressions
			if (node.left() instanceof LQDeepRef) {
				const [[deSugaredLeft], [[deSugaredRight]]] = this.deSugarPayload(
					[node.left()],
					[[node.right()]],
					payloadDimensions,
					$$options,
					linkedDb,
				);
				if (!deSugaredLeft) return; // Exclude in output
				return {
					nodeName: AssignmentExpr.NODE_NAME,
					operator: '=',
					left: deSugaredLeft,
					right: deSugaredRight,
				};
			}

			// Handle compound assignment exoressions
			if (node.left() instanceof ColumnsConstructor // Postgres
				&& node.left().entries().some((c) => c instanceof LQDeepRef)) {

				const columnsList = node.left().entries();
				let deSugaredColumns,
					deSugaredRight;

				if (node.right() instanceof SetConstructor/* Still passes even for RowConstructor */) {
					[deSugaredColumns, deSugaredRight] = this.deSugarPayload(
						columnsList,
						[node.right().entries()],
						payloadDimensions,
						$$options,
						linkedDb,
					);
					deSugaredRight = { nodeName: RowConstructor.NODE_NAME/* To be really formal */, entries: deSugaredRight };
				} else if (node.right() instanceof SubqueryConstructor) {
					[deSugaredColumns, deSugaredRight] = this.deSugarPayload(
						columnsList,
						node.right().expr(),
						payloadDimensions,
						$$options,
						linkedDb,
					);
					deSugaredRight = { nodeName: SubqueryConstructor.NODE_NAME, expr: deSugaredRight };
				} else {
					[deSugaredColumns, deSugaredRight] = this.deSugarPayload(
						columnsList,
						[[node.right()]],
						payloadDimensions,
						$$options,
						linkedDb,
					);
				}

				if (!deSugaredColumns.length) return; // Exclude in output
				return {
					nodeName: AssignmentExpr.NODE_NAME,
					operator: '=',
					left: { nodeName: ColumnsConstructor.NODE_NAME, entries: deSugaredColumns },
					right: deSugaredRight,
				};
			}
		};

		// Base JSON
		let resultJson = super.jsonfy(options, transformCallback, linkedDb);

		// --- TOP-LEVEL COLUMNS:VALUES/SELECT ---------------

		// Manually jsonfy these
		if (hasTopLevelDeepRefs) {
			const [deSugaredColumns, deSugaredValues] = this.deSugarPayload(
				columnsList,
				selectClause || valuesClause.entries().map((rowSet) => rowSet.entries()),
				payloadDimensions,
				options,
				linkedDb
			);
			resultJson = {
				...resultJson,
				columns_list: deSugaredColumns,
			};
			if (selectClause) {
				resultJson = { ...resultJson, select_clause: deSugaredValues };
			} else {
				const rowsJson = deSugaredValues.map((rowSetJson) => ({ nodeName: RowConstructor.NODE_NAME/* Most cross-dialect */, entries: rowSetJson }));
				resultJson = {
					...resultJson,
					values_clause: { nodeName: ValuesConstructor.NODE_NAME, entries: rowsJson },
				};
			}
		}

		// Apply payloadDimensions
		if (payloadDimensions.size) {
			resultJson = this.applyPayloadDimensions(resultJson, payloadDimensions, options, linkedDb);
		}
		return resultJson;
	}

	deSugarPayload(columns, values, payloadDimensions, { onConflictClauseContext = false, deSugar, ...$options } = {}, linkedDb = null) {

		const {
			LQDeepRef,
			TableRef,
			RowConstructor,
			SelectStmt,
			CompleteSelectStmt,
			SelectElement,
			FromElement,
			FromClause,
			StarRef,
		} = registry;

		// (1): Columns
		const deSugarColumnsList = (columnsList, dimensionsMap) => {
			return columnsList.reduce(columnsList, (columnRef, columnOffset) => {
				if (columnRef instanceof LQDeepRef) {
					const dimension = this.createPayloadDimension(columnRef, payloadDimensions, { onConflictClauseContext, ...$options }, linkedDb);
					dimensionsMap.set(columnOffset, dimension);
					if (dimension.type === 'dependency' && dimension.leftJson) {
						return columnsList.concat(dimension.leftJson);
					}
					return columnsList;
				}
				return columnsList.concat(columnRef.jsonfy/* @case1 */({ deSugar, ...$options }, null, linkedDb));
			}, []);
		};

		// (2.a): Select
		const deSugarValuesFromSelect = (selectStmt, dimensionsMap) => {
			// Declare base SELECT and select list
			let baseSelect = selectStmt.jsonfy/* @case1 */($options, null, linkedDb);
			let baseSelectList = baseSelect.select_list;
			if (baseSelectList[0].expr.nodeName === StarRef.NODE_NAME) {
				baseSelectList/* = infer from schema */; throw new Error(`TODO`);
			}
			// Create a CTE entry?
			if (!onConflictClauseContext) {
				const cteAlias = this._rand('cte');
				const cteSelect = { ...baseSelect, uuid: cteAlias, select_list: [{ nodeName: SelectElement.NODE_NAME, expr: { nodeName: StarRef.NODE_NAME } }] };
				payloadDimensions
					?.add({ type: 'memo', query: cteSelect });
				// Use that as new base
				const newBaseSelectFromElement = { nodeName: FromElement.NODE_NAME, expr: { nodeName: TableRef.NODE_NAME, value: cteAlias } };
				baseSelect = {
					nodeName: CompleteSelectStmt.NODE_NAME,
					from_clause: { nodeName: FromClause.NODE_NAME, entries: [newBaseSelectFromElement] }
				};
			}
			// Resolve base select list
			const newBaseSelectList = baseSelectList.reduce((selectList, fieldJson, columnOffset) => {
				if (dimensionsMap.has(columnOffset)) {
					let subSelectList;
					if (fieldJson.expr.nodeName === RowConstructor.NODE_NAME) {
						subSelectList = fieldJson.expr.entries;
					} else {
						subSelectList = [fieldJson.expr];
					}
					const valueNode = SelectStmt.fromJson({ ...baseSelect, select_list: subSelectList.map((f) => ({ nodeName: SelectElement.NODE_NAME, expr: f })) });
					fieldJson = dimensionsMap.get(columnOffset).offload(valueNode, rowOffset);
					if (fieldJson) return selectList.concat(fieldJson);
				}
				return selectList.concat(fieldJson);
			}, []);
			// The final deSugared query
			return { ...baseSelect, select_list: newBaseSelectList };
		};

		// (2.b): Values
		const deSugarValuesFromValues = (valuesEntries, dimensionsMap) => {
			return valuesEntries.map((valuesRow, rowOffset) => {
				return valuesRow.reduce((valuesRow, valueNode, columnOffset) => {
					const valueJson = dimensionsMap.has(columnOffset)
						? dimensionsMap.get(columnOffset).offload(valueNode, rowOffset)
						: valueNode.jsonfy/* @case1 */({ deSugar, ...$options }, null, linkedDb);
					if (valueJson) return valuesRow.concat(valueJson);
					return valuesRow;
				}, []);
			});
		};

		// Process...
		const dimensionsMap = new Map;
		const deSugaredColumns = deSugarColumnsList(columns, dimensionsMap);
		const deSugaredValues = values instanceof SelectStmt
			? deSugarValuesFromSelect(values, dimensionsMap)
			: deSugarValuesFromValues(values, dimensionsMap);
		dimensionsMap.clear();

		return [deSugaredColumns, deSugaredValues];
	}

	createPayloadDimension(LQRefColumn, payloadDimensions = null, { onConflictClauseContext = false, ...$options } = {}, linkedDb = null) {
		const { left, right, table } = LQRefColumn.getOperands(linkedDb);

		const {
			LQDeepRef,
			LQBackRefConstructor,
			ColumnNameRef,
			ColumnRef,
			TableRef,
			BasicAlias,
			AssignmentExpr,
			ColumnsConstructor,
			RowConstructor,
			SetConstructor,
			ValuesConstructor,
			ValuesSetConstructor,
			SelectStmt,
			CompleteSelectStmt,
			SubqueryConstructor,
			SelectElement,
			FromElement,
			FromClause,
			SetClause,
			BinaryExpr,
			BoolLiteral,
			NumberLiteral,
			UpdateStmt,
		} = registry;

		const dimensionID = `dimension${onConflictClauseContext ? '/c' : ''}::${[left, right, table].join('/')}`;
		const leftJson = left.jsonfy/* @case1 */($options, null, linkedDb);
		const rightJson = right.jsonfy/* @case1 */($options, null, linkedDb);

		// Figure the expected payload structure
		let columnsConstructorJson;
		const refRight = LQRefColumn.right();
		if (refRight instanceof ColumnsConstructor) {
			columnsConstructorJson = refRight.jsonfy/* @case1 */($options, null, linkedDb);
		} else if (refRight instanceof ColumnNameRef || refRight instanceof LQDeepRef) {
			columnsConstructorJson = { nodeName: ColumnsConstructor.NODE_NAME, entries: [refRight.jsonfy/* @case1 */($options, null, linkedDb)] };
		} else {
			throw new Error(`Invalid columns spec: ${LQRefColumn}`);
		}

		// Payload structure length validity
		const columnsLength = columnsConstructorJson.entries.length;
		const dimensionValidateRowLength = (rowNode) => {
			let rowLength = 1;
			if (rowNode instanceof SubqueryConstructor) {
				rowLength = rowNode.expr().length;
			} else if (rowNode instanceof SelectStmt) {
				rowLength = rowNode.length;
			} else if (rowNode instanceof RowConstructor) {
				rowLength = rowNode.length;
			}
			if (rowLength > columnsLength) throw new Error(`INSERT has more expressions than target columns`);
			if (rowLength < columnsLength) throw new Error(`INSERT has more target columns than expressions`);
			return rowNode;
		};

		// Compose:
		// - (SELECT <sourceCol> ->> <sourceRowIndex> FROM <sourceUuid>)
		const createForeignBinding = (sourceUuid, sourceCol, sourceRowIndex = null, innerFilter = null) => {
			const fieldExpr = typeof sourceRowIndex === 'number' ? ({
				nodeName: BinaryExpr.NODE_NAME,
				operator: '->>',
				left: sourceCol,
				right: { nodeName: NumberLiteral.NODE_NAME, value: sourceRowIndex },
			}) : sourceCol;
			const innerFilterExpr = typeof innerFilter === 'string' ? ({
				nodeName: BinaryExpr.NODE_NAME,
				operator: 'IS',
				left: { nodeName: ColumnRef.NODE_NAME, value: innerFilter },
				right: { nodeName: BoolLiteral.NODE_NAME, value: 'TRUE' },
			}) : null;
			const tableSpec = { nodeName: FromElement.NODE_NAME, expr: { nodeName: TableRef.NODE_NAME, value: sourceUuid } };
			const selectStmt = {
				nodeName: CompleteSelectStmt.NODE_NAME,
				select_list: [{ nodeName: SelectElement.NODE_NAME, expr: fieldExpr }],
				from_clause: { nodeName: FromClause.NODE_NAME, entries: [tableSpec] },
				...(innerFilterExpr ? { where_clause: innerFilterExpr } : {}),
			};
			return { nodeName: SubqueryConstructor.NODE_NAME, expr: selectStmt };
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
			// - WHERE <rightJson> IN (SELECT <leftJson> FROM <this.uuid> [WHERE <on_conflict_updated_status> IS TRUE]? )
			const onConflictUpdatedStatusAlias = onConflictClauseContext
				? `${this.uuid}_on_conflict_updated_status` : null;
			const whereClause = {
				nodeName: BinaryExpr.NODE_NAME,
				operator: 'IN',
				left: rightJson,
				right: createForeignBinding(this.uuid, leftJson, null, onConflictUpdatedStatusAlias),
			};

			const query = {
				uuid: this._rand('cte'),
				nodeName: UpdateStmt.NODE_NAME,
				tables: [{ nodeName: FromElement.NODE_NAME, expr: table.jsonfy/* @case1 */($options, null, linkedDb) }],
				set_clause: { nodeName: SetClause.NODE_NAME, entries: [] },
				where_clause: whereClause,
			};

			const offload = (payload) => {
				if (payload instanceof ValuesSetConstructor) {
					throw new Error(`Single-row payload structure expected for column structure: ${LQRefColumn.right()}. Recieved ${payload.NODE_NAME}.`);
				}
				if (query.set_clause.entries.length) {
					throw new Error(`Unexpected offload() call on ${LQRefColumn}`);
				}
				dimensionValidateRowLength(payload);
				let payloadJson = payload.jsonfy/* @case1 */($options, null, linkedDb);
				if (payload instanceof SelectStmt) {
					payloadJson = { nodeName: SubqueryConstructor.NODE_NAME, expr: payloadJson };
				} else if (!(payload instanceof SetConstructor)) {
					payloadJson = { nodeName: RowConstructor.NODE_NAME/* most formal */, entries: [payloadJson] };
				}
				query.set_clause.entries.push({
					nodeName: AssignmentExpr.NODE_NAME,
					operator: '=',
					left: columnsConstructorJson,
					right: payloadJson,
				});
			};

			const payloadDimension = {
				id: dimensionID,
				type: 'dependent',
				query,
				offload,
				leftJson,
				onConflictClauseContext
			};

			payloadDimensions
				?.add(payloadDimension);

			return payloadDimension;
		}

		// --- INSERT/UPSERT -------------

		const query = {
			uuid: this._rand('cte'),
			nodeName: this.NODE_NAME,
			table: table.jsonfy/* @case1 */($options, null, linkedDb),
			columns_list: columnsConstructorJson,
			values_clause: { nodeName: ValuesConstructor.NODE_NAME, entries: [] },
		};

		const dimensionPushRow = (payload, fKBindingJson = null) => {
			dimensionValidateRowLength(payload);
			const rowJson = payload instanceof SetConstructor
				? payload.jsonfy/* @case1 */($options, null, linkedDb)
				: { nodeName: RowConstructor.NODE_NAME/* most formal */, entries: [payload.jsonfy/* @case1 */($options, null, linkedDb)] };
			if (fKBindingJson) {
				query.values_clause.entries.push({ ...rowJson, entries: rowJson.entries.concat(fKBindingJson) });
			} else query.values_clause.entries.push(rowJson);
		};

		if (LQRefColumn.left() instanceof LQBackRefConstructor) {

			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> (a, b)) VALUES (2, ROW(44, 33)), (3, ROW(11, 22))
			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> a) VALUES (2, 44), (3, 11)
			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> a) SELECT a, b FROM t3

			query.columns_list.push(rightJson);

			const offload = (payload, rowOffset) => {
				const fKBindingJson = createForeignBinding(this.uuid, leftJson, rowOffset);

				if (payload instanceof CompleteSelectStmt) {
					dimensionValidateRowLength(payload);
					delete query.values_clause;
					const fkField = {
						nodeName: SelectElement.NODE_NAME,
						expr: fKBindingJson,
						alias: right instanceof ColumnRef ? { nodeName: BasicAlias.NODE_NAME, value: right.value() } : undefined
					};
					const selectJson = payload.jsonfy/* @case1 */($options, null, linkedDb);
					query.select_clause = { ...selectJson, select_list: selectJson.select_list.concat(fkField) };
					return;
				}

				if (payload instanceof ValuesSetConstructor) {
					for (const rowNode of payload.expr()) {
						dimensionPushRow(rowNode, fKBindingJson);
					}
				} else dimensionPushRow(payload, fKBindingJson);
			};

			const payloadDimension = {
				id: dimensionID,
				type: 'dependent',
				query,
				offload,
				leftJson
			};

			payloadDimensions
				?.add(payloadDimension);

			return payloadDimension;
		}

		// INSERT INTO t1 (a, t2 ~> fk ~> (a, b)) VALUES (2, ROW(44, 33)), (3, ROW(11, 22))
		// INSERT INTO t1 (a, t2 ~> fk ~> a) VALUES (2, 44), (3, 11)
		// INSERT INTO t1 (a, t2 ~> fk ~> a) SELECT a, b FROM t3

		const offload = (payload, rowOffset) => {
			if (payload instanceof ValuesSetConstructor) {
				throw new Error(`Single-row payload structure expected for column structure: ${LQRefColumn.right()}. Recieved ${payload.NODE_NAME}.`);
			}
			if (query.values_clause.entries.length || query.select_clause) {
				throw new Error(`Unexpected offload() call on ${LQRefColumn}`);
			}
			if (payload instanceof CompleteSelectStmt) {
				dimensionValidateRowLength(payload);
				delete query.values_clause;
				query.select_clause = payload.jsonfy/* @case1 */($options, null, linkedDb);
			} else dimensionPushRow(payload);
			// The binding element...
			const rightPKJson = { nodeName: ColumnRef.NODE_NAME, value: right.value() };
			const fKBindingJson = createForeignBinding(query.uuid, rightPKJson, rowOffset);
			return fKBindingJson;
		};

		const payloadDimension = {
			id: dimensionID,
			type: 'dependency',
			query,
			offload,
			leftJson
		};

		payloadDimensions
			?.add(payloadDimension);

		return payloadDimension;
	}

	applyPayloadDimensions(resultJson, payloadDimensions, options, linkedDb = null) {
		const cte = { nodeName: CTE.NODE_NAME, bindings: [], body: null };

		const {
			TableRef,
			CompleteSelectStmt,
			FromElement,
			CompositeAlias,
			FromClause,
			PGReturningClause,
			CTE,
			CTEBinding,
			UpdateStmt,
			InsertStmt,
			UpsertStmt
		} = registry;

		// Promote a query to a CTEBinding
		const toBinding = (dimensionID, queryJson) => {
			// Desugar query and flatten if itself a CTE
			if (queryJson.nodeName === CTE.NODE_NAME) {
				cte.bindings.push(...queryJson.bindings);
				queryJson = queryJson.body;
			}
			// Compose binding and add...
			cte.bindings.push({
				nodeName: CTEBinding.NODE_NAME,
				alias: { nodeName: CompositeAlias.NODE_NAME, value: dimensionID },
				expr: queryJson,
			});
		};
		const fromJSON = (queryJson, options) => {
			for (const Class of [UpdateStmt, InsertStmt, UpsertStmt]) {
				const node = Class.fromJSON(queryJson, options);
				if (node) return node;
			}
		};

		// (1): Process non-dependent entries
		const dependents = [], lefts = [];
		let onConflictUpdatedStatusRequired;
		for (const { id: dimensionID, type, query, leftJson, onConflictClauseContext } of payloadDimensions) {
			// Defer dependents
			if (type === 'dependent') {
				if (!lefts.find((existing) => _eq(existing, leftJson))) {
					lefts.push(leftJson);
				}
				if (onConflictClauseContext) {
					onConflictUpdatedStatusRequired = true;
				}
				dependents.push({ id: dimensionID, query });
				continue;
			}
			// Desugar query and flatten if itself a CTE
			toBinding(dimensionID, fromJSON(query, this.options).jsonfy/* @case2 */(options, null, linkedDb));
		}

		// (2): Rewrite resultJson as a CTEBinding?
		if (dependents.length) {
			// Rewrite returning clause
			const originalPGReturningClause = resultJson.returning_clause;

			// Compose binding and add...
			const newPGReturningClause = { nodeName: PGReturningClause.NODE_NAME, entries: [...lefts] };
			if (onConflictUpdatedStatusRequired) {
				const onConflictUpdatedStatusAlias = `${this.uuid}_on_conflict_updated_status`;
				// TODO
			}
			toBinding(this.uuid, { ...resultJson, returning_clause: newPGReturningClause });

			// Process dependents... after having done the above
			for (const { id: dimensionID, query } of dependents) {
				toBinding(dimensionID, fromJSON(query, this.options).jsonfy/* @case2 */(options, null, linkedDb));
			}

			// Derive final body...
			const tableSpec = { nodeName: FromElement.NODE_NAME, expr: { nodeName: TableRef.NODE_NAME, value: this.uuid } };
			cte.body = {
				nodeName: CompleteSelectStmt.NODE_NAME,
				select_list: originalPGReturningClause.entries,
				from_clause: { nodeName: FromClause.NODE_NAME, entries: [tableSpec] },
			};
		} else {
			// Use resultJson as-is
			cte.body = resultJson;
		}

		return cte;
	}
}