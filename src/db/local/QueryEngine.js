import { registry } from '../../lang/registry.js';
import { ExprEngine } from './ExprEngine.js';
export const GROUP_SYMBOL = Symbol.for('group');

export class QueryEngine {
    #storageEngine;
    #exprEngine;
    #options;

    constructor(storageEngine, options = {}) {
        this.#storageEngine = storageEngine;
        this.#options = options;
        this.#exprEngine = new ExprEngine(this.#options);
    }

    // -------- ENTRY

    async query(scriptNode) { return await this.#evaluate(scriptNode); }

    // -------- DISPATCHER

    async #evaluate(scriptNode, superLateralCtx = null, superCteRegistry = null) {
        let returnValue;
        for (const stmtNode of (scriptNode instanceof registry.Script && scriptNode || [scriptNode])) {
            if (!Array.isArray(stmtNode.originSchemas())) throw new Error('Expected a pre-resolved query object with originSchemas() returning an array');
            switch (stmtNode.NODE_NAME) {
                // DDL
                case 'CREATE_SCHEMA_STMT': returnValue = await this.#evaluateCREATE_SCHEMA(stmtNode); break;
                case 'ALTER_SCHEMA_STMT': returnValue = await this.#evaluateALTER_SCHEMA(stmtNode); break;
                case 'DROP_SCHEMA_STMT': returnValue = await this.#evaluateDROP_SCHEMA(stmtNode); break;
                case 'CREATE_TABLE_STMT': returnValue = await this.#evaluateCREATE_TABLE(stmtNode); break;
                case 'ALTER_TABLE_STMT': returnValue = await this.#evaluateALTER_TABLE(stmtNode); break;
                case 'DROP_TABLE_STMT': returnValue = await this.#evaluateDROP_TABLE(stmtNode); break;
                // CTE
                case 'CTE': returnValue = await this.#evaluateCTE(stmtNode, superLateralCtx, superCteRegistry); break;
                // DML
                case 'INSERT_STMT': returnValue = await this.#evaluateINSERT(stmtNode, superCteRegistry); break;
                case 'UPDATE_STMT': returnValue = await this.#evaluateUPDATE(stmtNode, superCteRegistry); break;
                case 'DELETE_STMT': returnValue = await this.#evaluateDELETE(stmtNode, superCteRegistry); break;
                // DQL
                case 'BASIC_SELECT_STMT':
                case 'COMPLETE_SELECT_STMT': returnValue = await this.#evaluateSELECT(stmtNode, superLateralCtx, superCteRegistry); break;
                case 'TABLE_STMT': returnValue = await this.#evaluateTABLE(stmtNode); break;
                default: throw new Error(`Unknown statement type: ${stmtNode.NODE_NAME}`);
            }
        }
        return returnValue;
    }

    // -------- DDL

    async #evaluateCREATE_SCHEMA(stmtNode) {
        const schemaName = stmtNode.name().value();
        const ifNotExists = stmtNode.ifNotExists() || false;
        return await this.#storageEngine.createSchema(schemaName, !ifNotExists);
    }

    async #evaluateALTER_SCHEMA(stmtNode) {
        const schemaName = stmtNode.name().value();
        const argument = stmtNode.argument();
        const ifNotExists = stmtNode.ifNotExists() || false;
        return await this.#storageEngine.alterSchema(schemaName, argument, !ifNotExists);
    }

    async #evaluateDROP_SCHEMA(stmtNode) {
        const schemaName = stmtNode.name().value();
        const ifNotExists = stmtNode.ifExists() || false;
        return await this.#storageEngine.dropSchema(schemaName, !ifNotExists);
    }

    async #evaluateCREATE_TABLE(stmtNode) {
        const argument = stmtNode.argument();
        const ifNotExists = stmtNode.ifNotExists() || false;
        return await this.#storageEngine.createTable(argument, undefined, !ifNotExists);
    }

    async #evaluateALTER_TABLE(stmtNode) {
        const tableName = stmtNode.name().value();
        const argument = stmtNode.argument();
        const ifNotExists = stmtNode.ifNotExists() || false;
        return await this.#storageEngine.alterTable(tableName, argument, !ifNotExists);
    }

    async #evaluateDROP_TABLE(stmtNode) {
        const tableName = stmtNode.name().value();
        const ifNotExists = stmtNode.ifExists() || false;
        return await this.#storageEngine.dropTable(tableName, undefined, !ifNotExists);
    }

    // -------- CTE

    async #evaluateCTE(stmtNode, superLateralCtx = null, superCteRegistry = null) {
        const cteRegistry = new Map(superCteRegistry || []);
        for (const cteItem of stmtNode.declarations()) {
            const cteName = cteItem.alias().value();
            if (cteRegistry?.has(cteName)) {
                throw new Error(`CTE name ${cteName} already exists in the current context`);
            }
            const itemBody = cteItem.expr();
            const cteStream = await this.#evaluate(itemBody, null, cteRegistry);
            cteRegistry.set(cteName, cteStream);
        }
        return await this.#evaluate(stmtNode.body(), superLateralCtx, cteRegistry);
    }

    // -------- DML

    async #evaluateINSERT(stmtNode, cteRegistry = null) {
        const _ = {};
        // Resolve schema/table spec
        const schemaName = stmtNode.tableRef().qualifier()?.value();
        const tableName = stmtNode.tableRef().value();
        const tableAlias = stmtNode.pgTableAlias()?.value() || '';
        const tableSchema = stmtNode.originSchemas()[0];

        // Resolve column names
        const definedColumns = Object.fromEntries(tableSchema.columns().map((col) => [col.name().value(), col]));
        const columnNames = stmtNode.columnList()?.entries().map((col) => col.value())
            || Object.keys(definedColumns);

        // Resolve defaults and constraints
        const defaultRecord = Object.create(null);
        for (const [colName, colSchema] of Object.entries(definedColumns)) {
            defaultRecord[colName] = null;
            if (_.cons = colSchema.defaultConstraint()) {
                defaultRecord[colName] = await this.#exprEngine.evaluate(_.cons.expr());
            }
        }

        // Build records
        const records = [];
        // ----------- a. values_clause
        if (_.valuesClause = stmtNode.valuesClause()) {
            for (const rowConstructor of _.valuesClause) {
                const record = { ...defaultRecord };
                const defaultContext = { [tableAlias]: record };
                for (const [i, valueExpr] of rowConstructor.entries().entries()) {
                    const colName = columnNames[i];
                    const colValue = await this.#exprEngine.evaluate(valueExpr, defaultContext, cteRegistry);
                    const colSchema = definedColumns[colName];
                    this.#acquireValue(record, colSchema, colValue);
                }
                records.push(record);
            }
        }
        // ----------- b. select_clause | my_table_clause
        else if ((_.selectList = stmtNode.selectList())
            || (_.myTableClause = stmtNode.myTableClause())) {
            const stream = _.myTableClause
                ? this.#evaluateTABLE(_.myTableClause)
                : this.#evaluateSELECT(_.selectList);
            for await (const _record of stream) {
                const record = { ...defaultRecord };
                for (const [colName, colValue] of Object.entries(_record)) {
                    const colSchema = definedColumns[colName];
                    this.#acquireValue(record, colSchema, colValue);
                }
                records.push(record);
            }
        }
        // ----------- c. pg_default_values_clause
        else if (stmtNode.pgDefaultValuesClause()) {
            const record = { ...defaultRecord };
            records.push(record);
        }
        // ----------- d. my_set_clause
        else if (_.mySetClause = stmtNode.mySetClause()) {
            const record = await this.#renderSetClause({ [tableAlias]: defaultRecord }, _.mySetClause);
            records.push(record);
        }

        // Dispatch to DB
        let rowCount = 0;
        const returnList = [];
        const conflictHandlingClause = stmtNode.conflictHandlingClause();
        const returningClause = stmtNode.returningClause();
        for (const record of records) {
            // Exec insert / update
            let finalizedRecord;
            try {
                finalizedRecord = await this.#storageEngine.insert(tableName, record, schemaName);
            } catch (e) {
                if (e instanceof ConflictError && conflictHandlingClause) {
                    const newLogicalRecord = await this.#renderSetClause({ [tableAlias]: e.existing }, conflictHandlingClause);
                    finalizedRecord = await this.#storageEngine.update(tableName, newLogicalRecord[tableAlias], schemaName);
                } else throw e;
            }
            // Process RETURNING clause
            if (returningClause) {
                const _record = Object.create(null);
                const outputRecordContext = { [tableAlias]: finalizedRecord };
                for (const selectItem of returningClause) {
                    const { alias, value } = await this.#exprEngine.evaluate(selectItem, outputRecordContext, cteRegistry);
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!returningClause) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    async #evaluateUPDATE(stmtNode, cteRegistry = null) {
        const _ = {};
        // Derive FromItems and JoinClauses
        let fromItems, joinClauses, updateTargets;
        if (_.myUpdateList = stmtNode.myUpdateList()) {
            // Derive FromItems and JoinClauses
            fromItems = _.myUpdateList;
            joinClauses = stmtNode.joinClauses() || [];
            // Derive update targets
            updateTargets = fromItems.concat(joinClauses).map((item) => {
                const tableRef = item.expr?.() || item.tableRef();
                const tableName = tableRef.value();
                const tableAlias = item.alias()?.value() || tableName;
                const schemaName = tableRef.qualifier()?.value();
                return [tableAlias, tableName, schemaName];
            });
        } else {
            const tableExpr = stmtNode.tableExpr();
            // Derive FromItems and JoinClauses
            fromItems = [tableExpr];
            joinClauses = (stmtNode.pgFromClause()?.entries() || []).concat(stmtNode.joinClauses() || []);
            // Derive update targets
            const schemaName = tableExpr.tableRef().qualifier()?.value();
            const tableName = tableExpr.tableRef().value();
            const tableAlias = tableExpr.alias()?.value() || '';
            updateTargets = [
                [tableAlias, tableName, schemaName],
            ];
        }

        // FROM -> composites
        let stream = await this.evaluateFromItems(fromItems, joinClauses, null, cteRegistry);
        if (_.whereClause = stmtNode.whereClause()) {
            stream = this.evaluateWhereClause(_.whereClause, stream, cteRegistry);
        }

        // 3. Exec updates
        let rowCount = 0;
        const returnList = [];
        const returningClause = stmtNode.returningClause();
        const setClause = stmtNode.setClause();
        for await (const logicalRecord of stream) {
            // Exec update
            const newLogicalRecord = await this.#renderSetClause(logicalRecord, setClause);
            for (const [tableAlias, tableName, schemaName] of updateTargets) {
                if (newLogicalRecord[tableAlias] === logicalRecord[tableAlias]) continue;
                await this.#storageEngine.update(tableName, newLogicalRecord[tableAlias], schemaName);
            }
            // Process RETURNING clause
            if (returningClause) {
                const _record = Object.create(null);
                for (const selectItem of returningClause) {
                    const { alias, value } = await this.#exprEngine.evaluate(selectItem, newLogicalRecord, cteRegistry);
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!returningClause) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    async #evaluateDELETE(stmtNode, cteRegistry = null) {
        const _ = {};
        // Derive FromItems and JoinClauses
        let fromItems, joinClauses, deleteTargets;
        if (_.myDeleteList = stmtNode.myDeleteList()) {
            // Derive FromItems and JoinClauses
            fromItems = _.myDeleteList;
            joinClauses = []
                .concat((stmtNode.myFromClause() || stmtNode.usingClause())?.entries() || [])
                .concat(stmtNode.joinClauses() || []);
            // Derive update targets
            deleteTargets = fromItems.map((item) => {
                const tableRef = item.tableRef();
                const tableName = tableRef.value();
                const schemaName = tableRef.qualifier()?.value();
                return [tableName, tableName, schemaName];
            });
        } else {
            const tableExpr = stmtNode.tableExpr();
            // Derive FromItems and JoinClauses
            fromItems = [tableExpr];
            joinClauses = (stmtNode.pgUsingClause()?.entries() || []).concat(stmtNode.joinClauses() || []);
            // Derive update targets
            const tableAlias = tableExpr.alias()?.value() || '';
            const tableRef = tableExpr.tableRef();
            const tableName = tableRef.value();
            const schemaName = tableRef.qualifier()?.value();
            deleteTargets = [
                [tableAlias, tableName, schemaName],
            ];
        }

        // FROM -> composites
        let stream = await this.evaluateFromItems(fromItems, joinClauses, null, cteRegistry);
        if (_.whereClause = stmtNode.whereClause()) {
            stream = this.evaluateWhereClause(_.whereClause, stream, cteRegistry);
        }

        // 3. Exec updates
        let rowCount = 0;
        const returnList = [];
        const returningClause = stmtNode.returningClause();
        for await (const logicalRecord of stream) {
            for (const [tableAlias, tableName, schemaName] of deleteTargets) {
                await this.#storageEngine.delete(tableName, logicalRecord[tableAlias], schemaName);
            }
            // Process RETURNING clause
            if (returningClause) {
                const _record = Object.create(null);
                for (const selectItem of returningClause) {
                    const { alias, value } = await this.#exprEngine.evaluate(selectItem, logicalRecord, cteRegistry);
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!returningClause) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    async #renderSetClause(logicalRecord, setClause, cteRegistry = null) {
        const newLogicalRecord = { ...logicalRecord };
        const baseAlias = Object.keys(logicalRecord)[0];
        for (const assignmentExpr of setClause) {
            const left = assignmentExpr.left();
            const right = assignmentExpr.right();
            if (left instanceof registry.ColumnsConstructor) {
                if (!(right instanceof registry.RowConstructor)) {
                    throw new Error(`Expected a RHS of type ROW_CONSTRUCTOR for a LHS of type COLUMNS_CONSTRUCTOR, but got ${right.NODE_NAME}`);
                }
                for (const [i, colNode] of left.entries().entries()) {
                    const colName = colNode.value();
                    const correspondingRight = right.entries()[i];
                    if (!correspondingRight) {
                        throw new Error(`Mismatched number of entries in SET clause: LHS has ${left.entries().length} but RHS has ${right.entries().length}`);
                    }
                    const colValue = await this.#exprEngine.evaluate(correspondingRight, logicalRecord, cteRegistry);
                    newLogicalRecord[baseAlias] = { ...newLogicalRecord[baseAlias], [colName]: colValue };
                }
            } else {
                const colName = left.value();
                const qualif = left.qualifier()?.value() || baseAlias;
                const colValue = await this.#exprEngine.evaluate(right, logicalRecord, cteRegistry);
                newLogicalRecord[qualif] = { ...newLogicalRecord[qualif], [colName]: colValue };
            }
        }
        return newLogicalRecord;
    }

    #acquireValue(record, colSchema, colValue, isSkipConstraints = false) {
        const colName = colSchema.name().value();
        record[colName] = colValue;
        return record;
        // TODO
        if ((!colSchema.identityConstraint() && !colSchema.autoIncrementConstraint())
            && ((_cons = colSchema.nullConstraint()) && _cons.value() === 'NOT')) {
            requireds.add(colName);
        }
        return inputValue;
    }

    // -------- DQL

    async *#evaluateTABLE(stmtNode) {
        // Resolve schema/table spec
        const tableRef = stmtNode.tableRef();
        const tableName = tableRef.value();
        const schemaName = tableRef.qualifier()?.value();
        // Exedute table scan
        yield* this.#storageEngine.getCursor(tableName, schemaName);
    }

    async *#evaluateSELECT(stmtNode, superLateralCtx = null, cteRegistry = null) {
        const _ = {};
        // 0. originSchemas: alias -> [ColumnSchema]
        const originSchemas = new Map(stmtNode.originSchemas().map((os) => {
            const alias = os instanceof registry.JSONSchema
                ? '' // Only one such expected in a query
                : os.name().value();
            const columns = os instanceof registry.JSONSchema
                ? os.entries()
                : os.columns();
            return [alias, columns];
        }));

        // 1. FROM -> composites, WHERE
        let stream = this.evaluateFromClause(
            stmtNode.fromClause(),
            stmtNode.joinClauses() || [],
            originSchemas,
            superLateralCtx,
            cteRegistry
        );
        if (_.whereClause = stmtNode.whereClause()) {
            stream = this.evaluateWhereClause(_.whereClause, stream, cteRegistry);
        }

        // 3. GROUPING / aggregates
        const groupByClause = stmtNode.groupByClause();
        const havingClause = stmtNode.havingClause();
        if (groupByClause?.length) {
            stream = this.evaluateGroupByClause(groupByClause, stream, havingClause);
        } else {
            stmtNode.walkTree((v) => {
                if (_.hasAggrFunctions) return;
                if (v instanceof registry.DerivedQuery
                    || v instanceof registry.ScalarSubquery) return;
                if (v instanceof registry.AggrCallExpr) {
                    _.hasAggrFunctions = true;
                }
            });
            if (_.hasAggrFunctions) {
                stream = this.evaluateGlobalGroup(stream);
            }
        }

        // 4. SELECT (projection) -- always works on compositeRecords
        stream = this.evaluateSelectList(stmtNode.selectList(), stream);

        // 5. ORDER BY (materialize) then LIMIT
        const orderByClause = stmtNode.orderByClause();
        if (orderByClause) stream = this.evaluateOrderByClause(orderByClause, stream);

        // 6. LIMIT + OFFSET
        const limitClause = stmtNode.limitClause();
        const offsetClause = stmtNode.offsetClause();
        if (limitClause || offsetClause) stream = this.evaluateLimitClause(limitClause, offsetClause, stream);

        yield* stream;
    }

    async evaluateFromClause(fromClause, joinClauses = [], originSchemas, superLateralCtx = null, cteRegistry = null) {
        if (!fromClause?.length) return (async function* () { yield {}; })();
        return await this.evaluateFromItems(fromClause.entries(), joinClauses, originSchemas, superLateralCtx, cteRegistry);
    }

    async evaluateFromItems(fromEntries, joinClauses, originSchemas, superLateralCtx = null, cteRegistry = null) {
        // combine base from entries then join clauses in order
        const allItems = [...fromEntries, ...(joinClauses || [])];
        // start with first item
        const firstItem = allItems[0];
        const firstItemAlias = firstItem.alias?.()?.value();
        let leftStream = this.evaluateFromItem(firstItem, originSchemas.get(firstItemAlias), superLateralCtx, cteRegistry);

        // progressively join subsequent items
        for (let idx = 1; idx < allItems.length; idx++) {
            const rightItem = allItems[idx];
            const rightItemAlias = rightItem.alias?.()?.value();

            // buffer right side composites
            let createRightStream;
            if (rightItem.lateralKW()) {
                createRightStream = (_lateralCtx) => this.evaluateFromItem(rightItem, originSchemas.get(rightItemAlias), _lateralCtx, cteRegistry);
            } else {
                const rightStream = this.evaluateFromItem(rightItem, originSchemas.get(rightItemAlias), null, cteRegistry);
                const rightBuffer = [];
                createRightStream = async function* () {
                    if (rightBuffer.length) {
                        yield* rightBuffer;
                    } else for await (const rc of rightStream) {
                        rightBuffer.push(rc);
                        yield rc;
                    }
                };
            }

            // determine join type and condition
            const joinType = rightItem.joinType() || (fromEntries.includes(rightItem) ? 'CROSS' : 'INNER');
            const joinCondition = rightItem.conditionClause()?.expr() || null;

            // join
            leftStream = this.evaluateJoin(leftStream, createRightStream, joinType, joinCondition, originSchemas, superLateralCtx, cteRegistry);
        }

        return leftStream;
    }

    async * evaluateFromItem(fromItem, originSchema, _lateralCtx = null, cteRegistry = null) {
        // ---------- a. TableAbstraction2 | TableAbstraction1

        if (fromItem instanceof registry.TableAbstraction2
            || fromItem instanceof registry.TableAbstraction1) {
            let tableRef, tableAlias;
            if (fromItem instanceof registry.TableAbstraction2) {
                tableRef = fromItem.tableRef();
                tableAlias = fromItem.alias();
            } else {
                tableRef = fromItem.tableRef();
            }
            // Part2 resolution: table scan
            const schemaName = tableRef.qualifier()?.value();
            const tableName = tableRef.value();
            const aliasName = tableAlias?.value() || tableName;
            // Consume table scan
            for await (let row of this.#storageEngine.getCursor(tableName, schemaName)) {
                yield { [aliasName]: row };
            }
            return;
        }

        // ---------- b. FromItem

        const fromItemExpr = fromItem.expr();
        const aliasName = fromItem.alias()?.value() || '';
        const expectedColWidth = originSchema.length;

        // ---------- DerivedQuery?
        if (fromItemExpr instanceof registry.DerivedQuery) {
            for await (const row of this.#evaluate(fromItemExpr.expr(), _lateralCtx, cteRegistry)) {
                const values = Object.values(row);
                const actualColWidth = values.length;
                if (actualColWidth !== expectedColWidth) {
                    throw new Error(`Expected number of columns from DerivedQuery function to be ${expectedColWidth} but got ${actualColWidth}`);
                }
                const _row = Object.create(null);
                for (let i = 0; i < actualColWidth; i++) {
                    this.#acquireValue(_row, originSchema[i], values[i]);
                }
                yield { [aliasName]: _row };
            }
            return;
        }

        // ---------- ValuesTableLiteral?
        if (fromItemExpr instanceof registry.ValuesTableLiteral) {
            for (const rowConstructor of fromItemExpr.entries()) {
                const actualColWidth = rowConstructor.length;
                if (actualColWidth !== expectedColWidth) {
                    throw new Error(`Expected number of columns in ROW_CONSTRUCTOR to be ${expectedColWidth} but got ${actualColWidth}`);
                }
                const row = Object.create(null);
                for (const [i, valueExpr] of rowConstructor.entries().entries()) {
                    this.#acquireValue(row, originSchema[i], await this.#exprEngine.evaluate(valueExpr, _lateralCtx, cteRegistry));
                }
                yield { [aliasName]: row };
            }
            return;
        }

        const createSRFGenerator = async (callExpr) => {
            const funcResult = await this.#exprEngine.evaluate(callExpr, _lateralCtx, cteRegistry);
            let asyncIter;
            if (Symbol.asyncIterator in funcResult) {
                asyncIter = funcResult[Symbol.asyncIterator]();
            } else if (Symbol.iterator in funcResult) {
                const iter = funcResult[Symbol.iterator]();
                asyncIter = {
                    async next() { return iter.next(); },
                    [Symbol.asyncIterator]() { return this; },
                };
            } else throw new Error(`Function ${callExpr.name()} did not return an iterable value or a promise of such thereof.`);
            return asyncIter;
        };

        const createSRFGenerator2 = async (callExpr, columnDefs) => {
            const asyncIter = await createSRFGenerator(callExpr);
            return asyncIter;
        };

        // ---------- SRFExpr1?
        if (fromItemExpr instanceof registry.SRFExpr1) {
            const callExpr = fromItemExpr.callExpr();
            const qualif = fromItemExpr.qualif(); // SRFExprDDL1 | SRFExprDDL2
            const aliasName = qualif.alias/* if SRFExprDDL2 */?.()?.value() || '';
            // Consume callExpr as async iterator
            for await (const row of createSRFGenerator2(callExpr, qualif.columnDefs())) {
                if (!Array.isArray(row) && !(row && typeof row === 'object')) {
                    throw new Error(`Function ${callExpr.name()} did not return an object or array value or a promise of such thereof.`);
                }
                const values = Object.values(row);
                const actualColWidth = values.length;
                if (actualColWidth !== expectedColWidth) {
                    throw new Error(`Expected number of columns from SRF function to be ${expectedColWidth} but got ${actualColWidth}`);
                }
                const _row = Object.create(null);
                for (let i = 0; i < actualColWidth; i++) {
                    this.#acquireValue(_row, originSchema[i], values[i]);
                }
                yield { [aliasName]: _row };
            }
            return;
        }

        // ---------- SRFExpr2?
        if (fromItemExpr instanceof registry.SRFExpr2) {
            const callExpr = fromItemExpr.callExpr();
            const withOrdinality = fromItemExpr.withOrdinality(); // Boolean
            // Consume callExpr as async iterator
            let rowIdx = 0;
            for await (const row of createSRFGenerator(callExpr)) {
                if (!Array.isArray(row) && !(row && typeof row === 'object')) {
                    throw new Error(`Function ${callExpr.name()} did not return an object or array value or a promise of such thereof.`);
                }
                const values = Object.values(row);
                if (withOrdinality) values.push(++rowIdx);
                const actualColWidth = values.length;
                if (actualColWidth !== expectedColWidth) {
                    throw new Error(`Expected number of columns from SRF function to be ${expectedColWidth} but got ${actualColWidth}`);
                }
                const _row = Object.create(null);
                for (let i = 0; i < actualColWidth; i++) {
                    this.#acquireValue(_row, originSchema[i], values[i]);
                }
                yield { [aliasName]: _row };
            }
            return;
        }

        // ---------- SRFExpr4?
        if (fromItemExpr instanceof registry.SRFExpr4) {
            const withOrdinality = fromItemExpr.withOrdinality(); // Boolean
            const asyncIters = [];
            // Initialize all SRF generators
            for (const entry of fromItemExpr.entries()) {
                if (!(entry instanceof registry.SRFExpr3)) {
                    throw new Error(`Expected SRFExpr3 but got ${entry?.NODE_NAME}`);
                }
                const callExpr = entry.callExpr();
                const qualif = entry.qualif(); // SRFExprDDL1
                const stream = await createSRFGenerator2(callExpr, qualif.columnDefs());
                asyncIters.push({ stream, callExpr });
            }
            // Zipped iteration
            let rowIdx = 0,
                colWidths = {};
            while (true) {
                let colIdx = 0,
                    allDone = true;
                const row = Object.create(null);
                for (let i = 0; i < asyncIters.length; i++) {
                    const { stream, callExpr } = asyncIters[i];
                    const r = await stream.next();
                    if (!r.done) {
                        allDone = false;
                        const _row = r.value;
                        if (!Array.isArray(_row) && !(_row && typeof _row === 'object')) {
                            throw new Error(`Function ${callExpr.name()} did not return an object or array value or a promise of such thereof.`);
                        }
                        const values = Object.values(_row);
                        // Determine/validate column width
                        if (!colWidths[i]) {
                            colWidths[i] = values.length;
                            if (colWidths[i] + colIdx + (withOrdinality ? 1 : 0) > expectedColWidth) {
                                throw new Error(`Number of columns from SRF function(s) (${colWidths[i] + colIdx + (withOrdinality ? 1 : 0)}) exceeds expected: expected ${expectedColWidth}`);
                            }
                        } else if (colWidths[i] !== values.length) {
                            throw new Error(`Inconsistent number of columns from SRF function: expected ${colWidths[i]} but got ${values.length}`);
                        }
                        // Render values into row
                        for (const value of values) {
                            this.#acquireValue(row, originSchema[colIdx], value);
                            colIdx++;
                        }
                    } else {
                        // Fill with nulls for this SRF
                        for (let j = 0; j < (colWidths[i] || 1); j++) {
                            this.#acquireValue(row, originSchema[colIdx], null, true);
                            colIdx++;
                        }
                    }
                }
                if (allDone) break;
                // Handle ordinality
                if (withOrdinality) {
                    this.#acquireValue(row, originSchema[colIdx], rowIdx + 1);
                    colIdx++;
                }
                // Yield
                yield { [aliasName]: row };
                rowIdx++;
            }
            return;
        }

        // ---------- TableRef1 | TableRef2
        const schemaName = fromItemExpr.qualifier()?.value();
        const tableName = fromItemExpr.value();

        // CTERef?
        let stream;
        if (fromItemExpr.resolution() === 'cte') {
            stream = cteRegistry?.get(tableName);
            if (!stream) throw new Error(`Implied CTE ${tableName} does not exist in the current context`);
            if (typeof stream[Symbol.asyncIterator] !== 'function') throw new Error(`Implied CTE ${tableName} does not return a record set`);
        } else {
            stream = this.#storageEngine.getCursor(tableName, schemaName);
        }

        // Consume stream
        let colWidth = null;
        for await (const row of stream) {
            const values = Object.values(row);
            const actualColWidth = values.length;
            if (actualColWidth !== expectedColWidth) {
                throw new Error(`Expected number of columns from ${aliasName} to be ${expectedColWidth} but got ${actualColWidth}`);
            }
            const _row = Object.create(null);
            for (let i = 0; i < actualColWidth; i++) {
                this.#acquireValue(_row, originSchema[i], values[i]);
            }
            yield { [aliasName]: _row };
        }
    }

    async * evaluateJoin(leftStream, createRightStream, joinType, joinCondition, originSchemas, superLateralCtx = null, cteRegistry = null) {
        // Composition helpers
        const nullFill = (baseComp, aliases) => {
            for (const alias of aliases) {
                if (baseComp[alias]) continue;
                const columns = originSchemas.get(alias);
                baseComp[alias] = Object.fromEntries(columns.map((col) => [col.name().value(), null]));
            }
        };

        const leftAliasSet = new Set;
        const rightUnmatched = new Set;

        // The JOIN
        for await (const leftComp of leftStream) {
            for (const k of Object.keys(leftComp)) leftAliasSet.add(k);
            const fullLeftComp = { ...(superLateralCtx || {}), ...leftComp };

            let leftMatched = false;
            for await (const rightComp of createRightStream(fullLeftComp)) {
                const fullMergedComp = { ...fullLeftComp, ...rightComp };
                if (!joinCondition/* Also: CROSS JOIN */
                    || await this.#exprEngine.evaluate(joinCondition, fullMergedComp, cteRegistry)) {
                    yield fullMergedComp;
                    leftMatched = true;
                } else if (joinType === 'RIGHT' || joinType === 'FULL') {
                    rightUnmatched.add(rightComp);
                }
            }

            if (!leftMatched && (joinType === 'LEFT' || joinType === 'FULL')) {
                yield nullFill({ ...leftComp }, Object.keys(rightComp));
            }
        }

        if (joinType === 'RIGHT' || joinType === 'FULL') {
            for (const rightComp of rightUnmatched) {
                yield nullFill({ ...rightComp }, [...leftAliasSet]);
            }
        }
    }

    async * evaluateWhereClause(whereClause, upstream, cteRegistry = null) {
        for await (const comp of upstream) {
            if (await this.#exprEngine.evaluate(whereClause.expr(), comp, cteRegistry)) yield comp;
        }
    }

    evaluateGroupByClause(groupByClause, upstream, havingClause = null) {
        const self = this;
        return (async function* () {
            const groups = new Map; // key -> array of compositeRecords

            for await (const comp of upstream) {
                // compute grouping key (use exprEngine)
                const keyParts = [];
                for (const groupingElement of groupByClause) {
                    keyParts.push(await self.#exprEngine.evaluate(groupingElement.expr(), comp));
                }
                const key = JSON.stringify(keyParts);

                if (!groups.has(key)) groups.set(key, []);
                const group = groups.get(key);

                // attach group reference then push (single-shot)
                comp[GROUP_SYMBOL] = group;
                group.push(comp);
            }

            // finalize groups: apply HAVING if present, yield representative compositeRecords
            for (const group of groups.values()) {
                if (group.length === 0) continue;
                const rep = group[0]; // representative composite
                // rep already has rep[GROUP_SYMBOL] = group
                if (havingClause) {
                    if (await self.#exprEngine.evaluate(havingClause.expr(), rep)) yield rep;
                } else {
                    yield rep;
                }
            }
        })();
    }

    evaluateGlobalGroup(upstream) {
        const self = this;
        return (async function* () {
            const members = [];
            for await (const comp of upstream) members.push(comp);
            // attach group array to members
            for (let i = 0; i < members.length; i++) members[i][GROUP_SYMBOL] = members;
            // representative: first member or empty composite
            const rep = members[0] ? { ...members[0] } : {};
            rep[GROUP_SYMBOL] = members;
            yield rep;
        })();
    }

    async * evaluateSelectList(selectList, upstream) {
        for await (const comp of upstream) {
            const projected = Object.create(null);
            for (const selectItem of selectList) {
                const { alias, value } = await this.#exprEngine.evaluate(selectItem, comp);
                projected[alias] = value;
            }
            yield projected;
        }
    }

    async * evaluateOrderByClause(orderByClause, upstream) {
        const rows = [];
        for await (const r of upstream) rows.push(r);
        // Precompute keys
        const decorated = await Promise.all(rows.map(async (row) => {
            const keys = await Promise.all(orderByClause.entries().map(orderElement =>
                this.#exprEngine.evaluate(orderElement.expr(), row)
            ));
            return { row, keys };
        }));
        // Sort synchronously
        decorated.sort((a, b) => {
            for (let i = 0; i < orderByClause.length; i++) {
                const dir = orderByClause.entries()[i].dir() === 'DESC' ? -1 : 1;
                if (a.keys[i] < b.keys[i]) return -dir;
                if (a.keys[i] > b.keys[i]) return dir;
            }
            return 0;
        });
        // Extract rows back
        for (const d of decorated) yield d.row;
    }

    async * evaluateLimitClause(limitClause, offsetClause, upstream) {
        const limit = limitClause ? await this.#exprEngine.evaluate(limitClause.expr()) : 0;
        const offset = offsetClause ? await this.#exprEngine.evaluate(offsetClause.expr()) : (
            limitClause.myOffset() ? await this.#exprEngine.evaluate(limitClause.myOffset()) : 0
        );
        let idx = 0, yielded = 0;
        for await (const r of upstream) {
            if (idx++ < offset) continue;
            if (limit && yielded++ >= limit) break;
            yield r;
        }
    }
}
