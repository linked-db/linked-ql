import { Transformer } from '../Transformer.js';
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

		const specials = ['column_list', 'pg_default_values_clause', 'values_clause', 'select_clause'].map((s) => this._get(s));
		const [columnList, pgDefaultValuesClause, valuesClause, selectClause] = specials;
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
					new ColumnsConstructor({ entries: [node.left()] }),
					[[node.right()]],
					transformer,
					linkedDb,
					$$options,
				);
				if (!deSugaredLhs) return; // Exclude in output
				return {
					nodeName: AssignmentExpr.NODE_NAME,
					operator: '=',
					left: deSugaredLhs.entries,
					right: deSugaredRhs,
				};
			}

			// Handle compound assignment exoressions
			if (node.left() instanceof ColumnsConstructor // Postgres
				&& node.left().entries().some((c) => c instanceof LQDeepRef2)) {

				const columnList = node.left();
				let deSugaredLhs,
					deSugaredRhs;

				if (node.right() instanceof RowConstructor/* Still passes even for TypedRowConstructor */) {
					[deSugaredLhs, [deSugaredRhs]] = this.deSugarPayload(
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
					[deSugaredLhs, [deSugaredRhs]] = this.deSugarPayload(
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
				pgDefaultValuesClause || valuesClause?.entries().map((rowSet) => rowSet.entries()) || selectClause,
				transformer,
				linkedDb,
				options,
			);

			resultJson = {
				...resultJson,
				column_list: { nodeName: ColumnsConstructor.NODE_NAME, entries: deSugaredLhs },
			};

			if (pgDefaultValuesClause && Array.isArray(deSugaredRhs) || valuesClause) {
				const rowsJson = deSugaredRhs.map((rowSetJson) => ({ nodeName: TypedRowConstructor.NODE_NAME/* Most cross-dialect */, entries: rowSetJson }));
				resultJson = {
					...resultJson,
					values_clause: { nodeName: ValuesConstructor.NODE_NAME, entries: rowsJson },
				};
			} else if (pgDefaultValuesClause) {
				resultJson = { ...resultJson, pg_default_values_clause: deSugaredRhs };
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
			ColumnRef1,
			SelectItemAlias,
			ColumnRef2,
			ColumnsConstructor,
			TypedRowConstructor,
			RowConstructor,
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

					if (dimension.refMode === 'dependency' && dimension.lhsOperandJson) {
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
		const deSugarValuesFromDefaultValues = (pgDefaultValuesClause, dimensionsMap) => {
			const valuesRow = columns.entries().reduce((valuesRow, columnRef, columnOffset) => {
				const valueJson = dimensionsMap.has(columnOffset)
					? dimensionsMap.get(columnOffset).offload(pgDefaultValuesClause)
					: { nodeName: DefaultLiteral.NODE_NAME, value: 'DEFAULT' };
				return valueJson
					? valuesRow.concat(valueJson)
					: valuesRow;
			}, []);

			if (columns.length - valuesRow.length === dimensionsMap.size) {
				// There were no depencies; only dependents
				return pgDefaultValuesClause.jsonfy();
			}

			// There were depencies
			return [valuesRow];
		};

		// (2.b): Values
		const deSugarValuesFromValues = (valuesEntries, dimensionsMap) => {
			return valuesEntries.map((valuesRow, rowOffset) => {
				return valuesRow.reduce((valuesRow, valueNode, columnOffset) => {
					let valueJson;
					if (columns.get(columnOffset) instanceof LQDeepRef2 && valueNode instanceof DefaultLiteral) {
						valueJson = dimensionsMap.get(columnOffset).offload(
							PGDefaultValuesClause.fromJSON({ value: 'DEFAULT' }, this.options),
							rowOffset
						);
					} else if (dimensionsMap.has(columnOffset)) {
						valueJson = dimensionsMap.get(columnOffset).offload(valueNode, rowOffset);
					} else {
						valueJson = jsonfy(valueNode);
					}
					return valueJson
						? valuesRow.concat(valueJson)
						: valuesRow;
				}, []);
			});
		};

		// (2.c): Select
		const deSugarValuesFromSelect = (selectStmt, dimensionsMap) => {
			// Declare base SELECT and select list
			let baseSelect = { ...jsonfy(selectStmt, 2), result_schema: undefined };
			let baseSelectItems = baseSelect.select_list.entries;

			if (baseSelectItems.length !== columns.length) {
				throw new Error(`Select list (${baseSelectItems.length}) does not match columns length (${columns.length})`);
			}

			// Create a CTE entry?
			let memoSelect;
			if (!onConflictClauseContext
				&& baseSelect.from_clause
				&& !/^[`"]\$memo~.+[`"]$/.test(selectStmt.fromClause().entries()[0].expr() + '')) {
				const memoSelectAlias = transformer.rootContext.rand('memo');
				memoSelect = {
					...baseSelect,
					uuid: memoSelectAlias,
					select_list: { nodeName: SelectList.NODE_NAME, entries: [rowNumberExpr('$row_number~a')] },
				};
				payloadDimensions.add({ refMode: 'memo', query: memoSelect });

				const newBaseSelectFromItem = { nodeName: FromItem.NODE_NAME, expr: { nodeName: TableRef1.NODE_NAME, value: memoSelectAlias } };
				baseSelect = {
					nodeName: CompleteSelectStmt.NODE_NAME,
					select_list: { nodeName: SelectList.NODE_NAME, entries: [] },
					from_clause: { nodeName: FromClause.NODE_NAME, entries: [newBaseSelectFromItem] },
				};
			}

			// Resolve base select list
			const rewriteAgainstMemoSelect = (fieldJson, obfuscateAlias = false) => {
				if (!memoSelect) return fieldJson;
				if (fieldJson.alias && obfuscateAlias) {
					fieldJson = {
						...fieldJson,
						alias: { ...fieldJson.alias, value: fieldJson.alias.value + transformer.rand('rand', { asSalt: true }) },
					};
				} else if (!fieldJson.alias) {
					fieldJson.alias = { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: transformer.rand('value') };
				}
				memoSelect.select_list.entries.push(fieldJson);
				return {
					nodeName: SelectItem.NODE_NAME,
					expr: { nodeName: ColumnRef1.NODE_NAME, value: fieldJson.alias.value, delim: fieldJson.alias.delim },
				};
			};

			const newBaseSelectList = baseSelectItems.reduce((selectList, fieldJson, columnOffset) => {
				if (dimensionsMap.has(columnOffset)) {
					let subSelectItems;

					if ([TypedRowConstructor.NODE_NAME, RowConstructor.NODE_NAME].includes(fieldJson.expr.nodeName)) {
						subSelectItems = fieldJson.expr.entries.map((entryJson) => {
							return rewriteAgainstMemoSelect({
								nodeName: SelectItem.NODE_NAME,
								expr: entryJson,
								alias: fieldJson.alias,
							}, true);
						});
						if (!(columns.get(columnOffset).right() instanceof ColumnsConstructor)) {
							subSelectItems = [{
								nodeName: SelectItem.NODE_NAME,
								expr: { nodeName: TypedRowConstructor.NODE_NAME, entries: subSelectItems.map((s) => s.expr) },
							}];
						}
					} else {
						subSelectItems = [rewriteAgainstMemoSelect(fieldJson)];
					}

					const valueNode = SelectStmt.fromJSON({
						...baseSelect,
						select_list: { nodeName: SelectList.NODE_NAME, entries: subSelectItems },
					}, this.options);

					fieldJson = dimensionsMap.get(columnOffset).offload(valueNode);

					if (fieldJson) {
						const lhsOperandJson = dimensionsMap.get(columnOffset).lhsOperandJson;
						return selectList.concat({
							nodeName: SelectItem.NODE_NAME,
							expr: fieldJson,
							alias: { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: lhsOperandJson.value, delim: lhsOperandJson.delim }
						});
					}

					return selectList;
				}

				if (!fieldJson.alias) {
					const correspondingColumn = columns.get(columnOffset);
					fieldJson = {
						...fieldJson,
						alias: { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: correspondingColumn.value(), delim: correspondingColumn._get('delim') },
					};
				};

				return selectList.concat(rewriteAgainstMemoSelect(fieldJson));
			}, []);

			baseSelect = {
				...baseSelect,
				select_list: {
					nodeName: SelectList.NODE_NAME,
					entries: newBaseSelectList,
				},
			}

			return baseSelect;
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
			RowConstructor,
			PGDefaultValuesClause,
			ValuesConstructor,
			ValuesTableLiteral,
			DefaultLiteral,
			SelectStmt,
			WhereClause,
			CompleteSelectStmt,
			ScalarSubquery,
			DerivedQuery,
			FromItem,
			FromClause,
			SetClause,
			BinaryExpr,
			BoolLiteral,
			NumberLiteral,
			UpdateStmt,
			TableAbstraction2,
		} = registry;

		const baseUUID = transformer.rootContext.hash(this, 'main');
		const jsonfy = (node) => {
			return node.jsonfy($options, transformer, linkedDb);
		};

		const lhsOperandJson = jsonfy(lhsOperand);
		const rhsOperandJson = jsonfy(rhsOperand);
		const rhsTableJson = jsonfy(rhsTable);

		const lhsOperand1Json = lhsOperand.jsonfy({ toKind: 1 });
		const rhsOperand1Json = rhsOperand.jsonfy({ toKind: 1 });
		const rhsTable1Json = { ...rhsTableJson, nodeName: TableRef1.NODE_NAME };
		const refMode = LQRefColumn.left() instanceof LQBackRefAbstraction
			? 'dependent'
			: 'dependency';
		const isDeepRef = detail instanceof LQDeepRef2;

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
		const dimensionValidateRowLength = (rowNode, result_schema = null) => {
			if (isDeepRef) return rowNode;
			let rowLength = 1;
			if (result_schema) {
				rowLength = result_schema.length;
			} else if (rowNode instanceof RowConstructor || rowNode instanceof SelectStmt) {
				rowLength = rowNode.length;
			} else if (rowNode instanceof SelectStmt) {
				rowLength = rowNode.length;
			} else if (rowNode instanceof DerivedQuery) {
				rowLength = rowNode.expr().length;
			}
			if (rowLength > columnsLength) throw new Error(`[${rowNode}] Payload has more columns than target columns: ${detail}.`);
			if (rowLength < columnsLength) throw new Error(`[${rowNode}] Payload has fewer columns than target columns: ${detail}.`);
			return rowNode;
		};

		// Compose:
		// - (SELECT <sourceCol> FROM <sourceUuid> WHERE <rand> = <sourceRowIndex>)
		const createForeignBinding = (sourceUuid, sourceCol, sourceRowIndex = null, innerFilter = null) => {
			let whereExpr;
			let whereExprRhs;

			if (typeof sourceRowIndex === 'number') {
				whereExprRhs = { nodeName: NumberLiteral.NODE_NAME, value: sourceRowIndex + 1 };
			} else if (sourceRowIndex) {
				whereExprRhs = sourceRowIndex;
			}

			if (whereExprRhs) {
				whereExpr = {
					nodeName: BinaryExpr.NODE_NAME,
					left: { nodeName: ColumnRef1.NODE_NAME, value: '$row_number~b' },
					operator: '=',
					right: whereExprRhs,
				};
			} else if (innerFilter) {
				whereExpr = {
					nodeName: BinaryExpr.NODE_NAME,
					left: { nodeName: ColumnRef1.NODE_NAME, value: innerFilter },
					operator: 'IS',
					right: { nodeName: BoolLiteral.NODE_NAME, value: 'TRUE' },
				};
			}

			const tableSpec = {
				nodeName: FromItem.NODE_NAME,
				expr: { nodeName: TableRef1.NODE_NAME, value: whereExprRhs ? `${sourceUuid}~indices` : sourceUuid },
			};

			const selectStmt = {
				nodeName: CompleteSelectStmt.NODE_NAME,
				select_list: { nodeName: SelectList.NODE_NAME, entries: [{ nodeName: SelectItem.NODE_NAME, expr: { ...sourceCol, qualifier: undefined } }] },
				from_clause: { nodeName: FromClause.NODE_NAME, entries: [tableSpec] },
				where_clause: whereExpr && { nodeName: WhereClause.NODE_NAME, expr: whereExpr },
			};

			return { nodeName: ScalarSubquery.NODE_NAME, expr: selectStmt };
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
			// - WHERE <rhsOperandJson> IN (SELECT <lhsOperandJson> FROM <baseUUID> [WHERE <on_conflict_updated_status> IS TRUE]? )
			const onConflictUpdatedStatusAlias = onConflictClauseContext
				? `${baseUUID}_on_conflict_updated_status` : null;

			const whereClause = {
				nodeName: BinaryExpr.NODE_NAME,
				left: rhsOperand1Json,
				operator: 'IN',
				right: createForeignBinding(baseUUID, lhsOperandJson, null, onConflictUpdatedStatusAlias),
			};

			const query = {
				uuid: transformer.rootContext.rand(refMode),
				nodeName: UpdateStmt.NODE_NAME,
				table_expr: { nodeName: TableAbstraction2.NODE_NAME, table_ref: rhsTable1Json },
				set_clause: { nodeName: SetClause.NODE_NAME, entries: [] },
				where_clause: { nodeName: WhereClause.NODE_NAME, expr: whereClause },
			};

			const offload = (payload) => {
				if (payload instanceof ValuesTableLiteral) {
					throw new Error(`Single-row payload structure expected for column structure: ${detail}. Recieved ${payload.NODE_NAME}.`);
				}
				if (query.set_clause.entries.length) {
					throw new Error(`Unexpected multiple offload() call on ${LQRefColumn}`);
				}

				// Carry deep values forward
				let payloadJson = jsonfy(payload);
				if (isDeepRef && !(payload instanceof PGDefaultValuesClause)) {
					payload = TypedRowConstructor.fromJSON({ entries: [payloadJson] }, this.options);
					payloadJson = jsonfy(payload);
				}

				if (payload instanceof SelectStmt) {
					payloadJson = { nodeName: DerivedQuery.NODE_NAME, expr: payloadJson, result_schema: payloadJson.result_schema };
					dimensionValidateRowLength(payload, payloadJson.result_schema);
				} else if (payload instanceof DerivedQuery) {
					dimensionValidateRowLength(payload, payloadJson.result_schema);
				} else if (payload instanceof RowConstructor) {
					dimensionValidateRowLength(payload);
				} else if (!(payload instanceof PGDefaultValuesClause)) {
					payloadJson = { nodeName: TypedRowConstructor.NODE_NAME/* most formal */, entries: [payloadJson] };
				}

				query.set_clause.entries.push({
					nodeName: AssignmentExpr.NODE_NAME,
					left: columnsConstructorJson,
					operator: '=',
					right: payloadJson,
				});

				if (refMode === 'dependency') {
					return lhsOperand1Json;
				}
			};

			const payloadDimension = {
				refMode,
				query,
				offload,
				lhsOperandJson,
				onConflictClauseContext
			};
			payloadDimensions.add(payloadDimension);

			return payloadDimension;
		}

		// --- INSERT/UPSERT -------------

		const queries = [];

		// This is for all INSERT types
		const dimensionPushRow = (query, payload, fKBindingJson = null) => {
			if (payload instanceof PGDefaultValuesClause) {
				if (fKBindingJson) {
					const lastIndex = query.column_list.entries.length - 1;
					query.values_clause.entries.push({
						nodeName: TypedRowConstructor.NODE_NAME/* most formal */,
						entries: query.column_list.entries.map((c, i) => {
							return i === lastIndex
								? fKBindingJson
								: { nodeName: DefaultLiteral.NODE_NAME, value: 'DEFAULT' };
						}),
					});
				} else {
					delete query.values_clause;
					query.pg_default_values_clause = jsonfy(payload);
				}
			} else {
				dimensionValidateRowLength(payload);
				let rowJson = jsonfy(payload);
				if (!(payload instanceof RowConstructor)) {
					rowJson = { nodeName: TypedRowConstructor.NODE_NAME/* most formal */, entries: [rowJson] };
				}
				if (fKBindingJson) {
					rowJson = { ...rowJson, entries: rowJson.entries.concat(fKBindingJson) };
				}
				query.values_clause.entries.push(rowJson);
			}
		};

		// BackRefing INSERTS
		if (refMode === 'dependent') {

			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> (a, b)) VALUES (2, ROW(44, 33)), (3, ROW(11, 22))
			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> a) VALUES (2, 44), (3, 11)
			// INSERT INTO t1 (a, (fk <~ fk <~ t2) ~> a) SELECT a, b FROM t3

			const queryTemplate = () => ({
				uuid: transformer.rootContext.rand(refMode),
				nodeName: this.NODE_NAME,
				table_ref: rhsTableJson,
				column_list: ColumnsConstructor.fromJSON({ entries: columnsConstructorJson.entries.concat(rhsOperandJson) }).jsonfy(),
			});

			const selectForeignBinding = (selectJson, fKBindingJson) => {
				const fkField = {
					nodeName: SelectItem.NODE_NAME,
					expr: fKBindingJson,
					alias: rhsOperand instanceof ColumnRef2
						? { nodeName: SelectItemAlias.NODE_NAME, as_kw: true, value: rhsOperand.value(), delim: rhsOperand._get('delim') }
						: undefined,
				};
				return {
					...selectJson,
					select_list: { ...selectJson.select_list, entries: selectJson.select_list.entries.concat(fkField) },
				};
			};

			const offload = (payload, correlationRhs = null) => {

				if (!queries.length) {
					queries.push(queryTemplate());
				}
				let currentQuery = queries[queries.length - 1];

				if (payload instanceof SelectStmt) {
					// Meaning we're from a literal INSERT ... SELECT statement, not an INSERT ... VALUES (+SELECT) statement
					// and this time, we want to correlate with base query's row number
					correlationRhs = {
						nodeName: ColumnRef1.NODE_NAME,
						value: '$row_number~a',
					};
				}

				const fKBindingJson = createForeignBinding(baseUUID, lhsOperandJson, correlationRhs);

				// Scenario 2:
				// When the base query is an INSERT ... VALUES (+DerivedQuery)
				let isDerivedQuery;
				if (payload instanceof DerivedQuery) {
					payload = payload.expr();
					// For when preceding offload() was scenario 2 or 3
					if (currentQuery.select_clause || currentQuery.values_clause) {
						currentQuery = queryTemplate();
						queries.push(currentQuery);
					}
					isDerivedQuery = true;
				}

				// Scenario 1 or 2:
				// When the base query is an INSERT ... SELECT
				// or when the preceding scenario is the case
				if (payload instanceof SelectStmt) {
					let selectJson = jsonfy(payload);
					if (!isDerivedQuery && !isDeepRef) {
						// Fully qualify output names to match target column names. Not necessary at the LinkedQL level
						selectJson = deriveSelectAliasesFromColumns(selectJson, columnsConstructorJson);
					}
					dimensionValidateRowLength(payload, selectJson.result_schema);
					currentQuery.select_clause = selectForeignBinding(selectJson, fKBindingJson);
					return;
				}

				// Scenario 3:
				// When base query is INSERT ... VALUES

				// For when preceding offload() was scenario 2
				if (currentQuery.select_clause) {
					currentQuery = queryTemplate();
					queries.push(currentQuery);
				}
				if (!currentQuery.values_clause) {
					currentQuery.values_clause = { nodeName: ValuesConstructor.NODE_NAME, entries: [] };
				}

				// Carry deep values forward
				if (isDeepRef && !(payload instanceof PGDefaultValuesClause)) {
					payload = TypedRowConstructor.fromJSON({ entries: [jsonfy(payload)] });
				}

				if (payload instanceof ValuesTableLiteral) {
					for (const rowNode of payload.entries()) {
						dimensionPushRow(currentQuery, rowNode, fKBindingJson);
					}
				} else dimensionPushRow(currentQuery, payload, fKBindingJson);
			};

			const payloadDimension = {
				refMode,
				queries,
				offload,
				lhsOperandJson,
			};

			payloadDimensions.add(payloadDimension);

			return payloadDimension;
		}

		// INSERT INTO t1 (a, t2 ~> fk ~> (a, b)) VALUES (2, ROW(44, 33)), (3, ROW(11, 22))
		// INSERT INTO t1 (a, t2 ~> fk ~> a) VALUES (2, 44), (3, 11)
		// INSERT INTO t1 (a, t2 ~> fk ~> a) SELECT a, b FROM t3

		// The binding elements...
		const rhsOperandPKJson = { nodeName: ColumnRef1.NODE_NAME, value: rhsOperand.value(), delim: rhsOperand._get('delim') };

		const queryTemplate = () => ({
			uuid: transformer.rootContext.rand(refMode),
			nodeName: this.NODE_NAME,
			table_ref: rhsTableJson,
			column_list: columnsConstructorJson,
			returning_clause: {
				nodeName: ReturningClause.NODE_NAME,
				entries: [{ nodeName: SelectItem.NODE_NAME, expr: rhsOperand1Json }],
			},
		});

		const offload = (payload) => {

			if (payload instanceof ValuesTableLiteral) {
				throw new Error(`Single-row payload structure expected for column structure: ${LQRefColumn.right()}. Recieved ${payload.NODE_NAME}.`);
			}

			if (!queries.length) {
				queries.push(queryTemplate());
			}
			let currentQuery = queries[queries.length - 1];

			let isDerivedQuery = false;

			// Scenario 2:
			// When the base query is an INSERT ... VALUES (+DerivedQuery)
			if (payload instanceof DerivedQuery) {
				payload = payload.expr();
				// For when preceding offload() was scenario 2 or 3
				if (currentQuery.select_clause || currentQuery.values_clause) {
					currentQuery = queryTemplate();
					queries.push(currentQuery);
				}
				isDerivedQuery = true;
			}

			// Scenario 1 or 2:
			// When the base query is an INSERT ... SELECT
			// or when the preceding scenario is the case
			if (payload instanceof SelectStmt) {

				let selectJson = jsonfy(payload);
				let correlationRhs;

				if (!isDerivedQuery) {
					if (!isDeepRef) {
						// Fully qualify output names to match target column names. Not necessary at the LinkedQL level
						selectJson = deriveSelectAliasesFromColumns(selectJson, columnsConstructorJson);
					}
					// Meaning we're from a literal INSERT ... SELECT statement, not an INSERT ... VALUES (+SELECT) statement
					// and this time, we want to correlate with base query's row number
					correlationRhs = { nodeName: ColumnRef1.NODE_NAME, value: '$row_number~a' };
				}

				dimensionValidateRowLength(payload, selectJson.result_schema);
				currentQuery.select_clause = selectJson;

				return createForeignBinding(currentQuery.uuid, rhsOperandPKJson, correlationRhs);
			}

			// Scenario 3:
			// When base query is INSERT ... VALUES

			// For when preceding offload() was scenario 2
			if (currentQuery.select_clause) {
				currentQuery = queryTemplate();
				queries.push(currentQuery);
			}
			if (!currentQuery.values_clause) {
				currentQuery.values_clause = { nodeName: ValuesConstructor.NODE_NAME, entries: [] };
			}

			// Carry deep values forward
			if (isDeepRef && !(payload instanceof PGDefaultValuesClause)) {
				payload = TypedRowConstructor.fromJSON({ entries: [jsonfy(payload)] });
			}

			dimensionPushRow(currentQuery, payload);

			let correlationRhs;
			if (currentQuery.values_clause) {
				// Meaning we're from an INSERT ... VALUES statement, not an INSERT ... DEFAULT VALUES statement
				// and this this time, currentQuery's row offset is what we use
				correlationRhs = currentQuery.values_clause.entries.length - 1;
			}

			return createForeignBinding(currentQuery.uuid, rhsOperandPKJson, correlationRhs);
		};

		const payloadDimension = {
			refMode,
			queries,
			offload,
			lhsOperandJson,
			rhsOperandJson: rhsOperand1Json
		};

		payloadDimensions.add(payloadDimension);

		return payloadDimension;
	}

	finalizePayloadJSON(resultJson, transformer, linkedDb, options) {

		const payloadDimensions = transformer.statementContext.artifacts.get('payloadDimensions');
		if (!payloadDimensions.size) {
			return resultJson;
		}

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
			UpdateStmt,
		} = registry;

		const baseUUID = transformer.rootContext.hash(this, 'main');
		const cte = { nodeName: CTE.NODE_NAME, declarations: [], body: null };
		const $transformer = transformer;//new Transformer((node, defaultTransform) => defaultTransform(), null, this);

		// Promote a query to a CTEItem
		const toCTEItem = (dimensionID, queryJson, indices = [], transformer = $transformer) => {

			let cteItemJson = CTEItem.fromJSON({
				nodeName: CTEItem.NODE_NAME,
				alias: { nodeName: CTEItemAlias.NODE_NAME, value: dimensionID },
				expr: queryJson,
			}, this.options).jsonfy(options, transformer, linkedDb);

			// Desugar query and flatten if itself a CTE
			if (cteItemJson.expr?.nodeName === CTE.NODE_NAME) {
				cte.declarations.push(...cteItemJson.expr.declarations);

				if (this instanceof UpdateStmt && cteItemJson.expr.body.nodeName === CompleteSelectStmt.NODE_NAME) {
					// This is a stray "SELECT COUNT(*)" statement owing to how dependencies are rendered in the CTE as dependents
					return;
				}

				cteItemJson = {
					nodeName: CTEItem.NODE_NAME,
					alias: { nodeName: CTEItemAlias.NODE_NAME, value: dimensionID },
					expr: cteItemJson.expr.body,
				};
			}

			// Compose declaration and add...
			cte.declarations.push(cteItemJson);

			if (!indices.length) return;

			cte.declarations.push(CTEItem.fromJSON({
				nodeName: CTEItem.NODE_NAME,
				alias: { nodeName: CTEItemAlias.NODE_NAME, value: `${dimensionID}~indices` },
				expr: flipSelectFromWithRowNumbers(indices, dimensionID),
			}, this.options).jsonfy(options, transformer, linkedDb));
		};

		// Process entries in stringent order
		const dependents = [],
			deferedDependencies = [],
			lefts = [];

		let onConflictUpdatedStatusRequired = false;
		const originalReturningList = resultJson.returning_clause?.entries || [];

		for (const { refMode, query: $query, queries, lhsOperandJson, rhsOperandJson, onConflictClauseContext } of payloadDimensions) {
			for (const { uuid, ...query } of ($query && [$query] || queries)) {
				if (refMode === 'dependent' || (this instanceof UpdateStmt && refMode === 'dependency')) { // Defer dependents

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

					dependents.push({ uuid, ...query });
				} else if (refMode === 'dependency') {
					const wherePredicate = [{ nodeName: SelectItem.NODE_NAME, expr: rhsOperandJson }];

					if (resultJson.select_clause) {
						deferedDependencies.push({ uuid, wherePredicate, ...query }); // Dependencies that themselves depend on memo
					} else if (query.pg_default_values_clause || query.select_clause) {
						toCTEItem(uuid, query);
					} else {
						toCTEItem(uuid, query, wherePredicate);
					}
				} else {
					toCTEItem(uuid, query);
				}
			}
		}

		// (1): Process dependencies with memo
		for (const { uuid, wherePredicate, ...query } of deferedDependencies) {
			toCTEItem(uuid, query, wherePredicate);
		}

		// (2): Process dependents
		if (dependents.length) {

			// Rewrite returning clause
			const newOuterReturningList = [];
			for (const fieldExpr of originalReturningList) {
				if (fieldExpr.alias) {
					newOuterReturningList.push({ ...fieldExpr, expr: { nodeName: ColumnRef1.NODE_NAME, value: fieldExpr.alias.value, delim: fieldExpr.alias.delim } });
				} else {
					newOuterReturningList.push({ ...fieldExpr });
				}
			}

			// Compose binding and add...
			const cteReturningClause = {
				nodeName: ReturningClause.NODE_NAME,
				entries: [...originalReturningList, ...lefts],
			};

			if (onConflictUpdatedStatusRequired) {
				const onConflictUpdatedStatusAlias = `${baseUUID}_on_conflict_updated_status`;
				// TODO
			}

			if (this instanceof UpdateStmt) {
				toCTEItem(baseUUID, { ...resultJson, returning_clause: cteReturningClause });
			} else if (resultJson.pg_default_values_clause) {
				toCTEItem(baseUUID, { ...resultJson, returning_clause: cteReturningClause });
			} else {
				toCTEItem(baseUUID, { ...resultJson, returning_clause: cteReturningClause }, lefts);
			}

			// Process dependents... after having done the above
			for (const { uuid, ...query } of dependents) {
				toCTEItem(uuid, query);
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

			const tableSpec = { nodeName: FromItem.NODE_NAME, expr: { nodeName: TableRef1.NODE_NAME, value: baseUUID } };

			cte.body = CompleteSelectStmt.fromJSON({
				nodeName: CompleteSelectStmt.NODE_NAME,
				select_list: { nodeName: SelectList.NODE_NAME, entries: selectItems },
				from_clause: { nodeName: FromClause.NODE_NAME, entries: [tableSpec] },
			}, this.options).jsonfy(options, $transformer, linkedDb);
		} else {
			// Use resultJson as-is
			const Classes = [this.constructor].concat(this.constructor.morphsTo()); // InsertStmt/UpsertStmt
			const instance = Classes.reduce((prev, C) => prev || C.fromJSON(resultJson, this.options), undefined);
			cte.body = instance.jsonfy(options, $transformer, linkedDb);
		}

		return { ...cte, result_schema: cte.body.result_schema };
	}
}

const deriveSelectAliasesFromColumns = (selectJson, columnsConstructorJson) => {
	const newSelectList = selectJson.select_list.entries.reduce((selectList, fieldJson, columnOffset) => {
		if (!fieldJson.alias) {
			const correspondingColumn = columnsConstructorJson.entries[columnOffset];
			fieldJson = {
				...fieldJson,
				alias: { nodeName: registry.SelectItemAlias.NODE_NAME, as_kw: true, value: correspondingColumn.value, delim: correspondingColumn.delim },
			}
		}
		return selectList.concat(fieldJson);
	}, []);
	return {
		...selectJson,
		select_list: {
			...selectJson.select_list,
			entries: newSelectList,
		},
	};
};

const flipSelectFromWithRowNumbers = (selectItems, fromName) => {
	const rowNumberJson = rowNumberExpr('$row_number~b');

	selectItems = selectItems.map((fieldJson) => {
		if (fieldJson.alias) {
			// Flip expr/alias
			return {
				...fieldJson,
				expr: { ...fieldJson.expr, value: fieldJson.alias.value, delim: fieldJson.alias.delim, qualifier: undefined },
				alias: { ...fieldJson.alias, value: fieldJson.expr.value, delim: fieldJson.expr.delim },
			};
		}
		return fieldJson.expr.nodeName === registry.ColumnRef0.NODE_NAME ? i : {
			...fieldJson,
			expr: { ...fieldJson.expr, qualifier: undefined },
			alias: { nodeName: registry.SelectItemAlias.NODE_NAME, as_kw: true, value: fieldJson.expr.value, delim: fieldJson.expr.delim },
		};
	}).concat(rowNumberJson);

	const fromItemJson = {
		nodeName: registry.FromItem.NODE_NAME,
		expr: { nodeName: registry.TableRef1.NODE_NAME, value: fromName },
	};

	return {
		nodeName: registry.CompleteSelectStmt.NODE_NAME,
		select_list: { nodeName: registry.SelectList.NODE_NAME, entries: selectItems },
		from_clause: { nodeName: registry.FromClause.NODE_NAME, entries: [fromItemJson] },
	};
};

const rowNumberExpr = (alias) => ({
	nodeName: registry.SelectItem.NODE_NAME,
	expr: { nodeName: registry.AggrCallExpr.NODE_NAME, name: 'ROW_NUMBER', arguments: [], over_clause: { nodeName: registry.WindowSpec.NODE_NAME } },
	alias: { nodeName: registry.SelectItemAlias.NODE_NAME, as_kw: true, value: alias || 3 },
});