import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ConflictError } from './ConflictError.js';
import { ExprEngine } from './ExprEngine.js';
import { registry } from '../../lang/registry.js';

export const GROUPING_META = Symbol.for('grouping_meta');
export const WINDOW_META = Symbol.for('window_meta');

export class QueryEngine extends SimpleEmitter {

    #storageEngine;
    #exprEngine;
    #options;

    constructor(storageEngine, { dialect = 'postgres', ...options } = {}) {
        super();
        this.#storageEngine = storageEngine;
        this.#options = { dialect, ...options };

        // The ExprEngine
        const self = this;
        this.#exprEngine = new ExprEngine(
            async function* (derivedQuery, compositeRow, queryCtx) {
                let queryString, result;
                // Always run afresh if correlated or if first time
                if (derivedQuery.isCorrelated() || !(
                    result = queryCtx.cteRegistry?.get(queryString = derivedQuery.stringify()))) {
                    const _queryCtx = { ...queryCtx, lateralCtx: { ...(queryCtx.lateralCtx || {}), ...compositeRow }, depth: queryCtx.depth + 1 };
                    result = await self.#evaluateSTMT(
                        derivedQuery.expr(),
                        _queryCtx
                    );
                    if (queryCtx.cteRegistry && queryString) {
                        // Cache now being not isCorrelated()
                        const _result = result, copy = [];
                        queryCtx.cteRegistry.set(queryString, copy);
                        result = (async function* () {
                            for await (const row of _result) {
                                copy.push(row);
                                yield row;
                            }
                        })();
                    }
                }
                yield* result;
            },
            this.#options,
        );
    }

    // -------- ENTRY

    async query(scriptNode, options = {}) {
        const events = [];

        const txId = `$tx${(0 | Math.random() * 9e6).toString(36)}`;
        const queryCtx = {
            options: { ...this.#options, ...options },
            txId, lateralCtx: null,
            cteRegistry: new Map,
            depth: 0,
        };
        const eventsAbortLine = this.#storageEngine.on('changefeed', (event) => {
            if (event.txId !== txId) return;
            events.push(event);
        });

        const returnValue = await this.#evaluateSTMT(scriptNode, queryCtx);
        if (returnValue && typeof returnValue?.[Symbol.asyncIterator] === 'function' && options.bufferResultRows !== false) {
            const rows = [];
            for await (const r of returnValue) rows.push(r);
            return rows;
        }

        eventsAbortLine();
        if (events.length) this.emit('changefeed', events);
        return returnValue;
    }

    // -------- DISPATCHER

    async #evaluateSTMT(scriptNode, queryCtx) {
        let returnValue;
        for (let stmtNode of (scriptNode instanceof registry.Script && scriptNode || [scriptNode])) {
            switch (stmtNode.NODE_NAME) {
                // DDL
                case 'CREATE_SCHEMA_STMT': returnValue = await this.#evaluateCREATE_SCHEMA_STMT(stmtNode, queryCtx); break;
                case 'ALTER_SCHEMA_STMT': returnValue = await this.#evaluateALTER_SCHEMA_STMT(stmtNode, queryCtx); break;
                case 'DROP_SCHEMA_STMT': returnValue = await this.#evaluateDROP_SCHEMA_STMT(stmtNode, queryCtx); break;
                case 'CREATE_TABLE_STMT': returnValue = await this.#evaluateCREATE_TABLE_STMT(stmtNode, queryCtx); break;
                case 'ALTER_TABLE_STMT': returnValue = await this.#evaluateALTER_TABLE_STMT(stmtNode, queryCtx); break;
                case 'DROP_TABLE_STMT': returnValue = await this.#evaluateDROP_TABLE_STMT(stmtNode, queryCtx); break;
                // CTE
                case 'CTE': returnValue = await this.#evaluateCTE(stmtNode, queryCtx); break;
                // DML
                case 'INSERT_STMT': returnValue = await this.#evaluateINSERT_STMT(stmtNode, queryCtx); break;
                case 'UPDATE_STMT': returnValue = await this.#evaluateUPDATE_STMT(stmtNode, queryCtx); break;
                case 'DELETE_STMT': returnValue = await this.#evaluateDELETE_STMT(stmtNode, queryCtx); break;
                // DQL
                case 'TABLE_STMT': returnValue = await this.#evaluateTABLE_STMT(stmtNode, queryCtx); break;
                case 'BASIC_SELECT_STMT':
                case 'COMPLETE_SELECT_STMT': returnValue = await this.#evaluateSELECT_STMT(stmtNode, queryCtx); break;
                case 'COMPOSITE_SELECT_STMT': returnValue = await this.#evaluateCOMPOSITE_SELECT_STMT(stmtNode, queryCtx); break;
                default: throw new Error(`Unknown statement type: ${stmtNode.NODE_NAME}`);
            }
        }
        return returnValue;
    }

    // -------- DDL

    async #evaluateCREATE_SCHEMA_STMT(stmtNode, queryCtx) {
        const schemaName = stmtNode.name().value();
        if (!schemaName) {
            throw new Error('Cannot create a schema with an empty name');
        }
        const _queryCtx = { ...queryCtx, ifNotExists: !!stmtNode.ifNotExists() };
        const returnValue = await this.#storageEngine.createSchema(schemaName, _queryCtx);
        // Evaluate entries if any
        if (returnValue && stmtNode.pgEntries()?.length) {
            if (ifNotExists) {
                throw new Error('CREATE SCHEMA ... IF NOT EXISTS ... with entries is not supported');
            }
            const __queryCtx = { ..._queryCtx, schemaName };
            for (const entry of stmtNode.pgEntries()) {
                await this.#evaluateSTMT(entry, __queryCtx);
            }
        }
        return returnValue;
    }

    async #evaluateALTER_SCHEMA_STMT(stmtNode, queryCtx) {
        // TODO notice
        throw new Error('ALTER SCHEMA is not supported yet in the in-memory StorageEngine');
        const schemaName = stmtNode.name().value();
        const argument = stmtNode.argument();
        const ifNotExists = !!stmtNode.ifNotExists();
        return await this.#storageEngine.alterSchema(schemaName, argument, !ifNotExists, queryCtx);
    }

    async #evaluateDROP_SCHEMA_STMT(stmtNode, queryCtx) {
        const schemaNames = stmtNode.myName()
            ? [stmtNode.myName().value()]
            : stmtNode.pgNames().map((n) => n.value());
        const _queryCtx = { ...queryCtx, ifExists: !!stmtNode.ifExists(), cascade: stmtNode.pgCascadeRule() === 'CASCADE' };
        let returnValue;
        for (const schemaName of schemaNames) {
            returnValue = await this.#storageEngine.dropSchema(schemaName, _queryCtx);
        }
        return returnValue;
    }

    async #evaluateCREATE_TABLE_STMT(stmtNode, queryCtx) {
        if (stmtNode.temporaryKW()) {
            throw new Error('TEMPORARY tables are not supported yet in the in-memory StorageEngine');
        }
        const argument = stmtNode.argument();
        if (queryCtx.schemaName && argument.name().qualifier() && !argument.name().qualifier().identifiesAs(queryCtx.schemaName)) {
            throw new Error(`Cannot create table ${argument.name().toString()} in schema ${queryCtx.schemaName} as it is qualified to schema ${argument.name().qualifier().toString()}`);
        }
        const _queryCtx = { ...queryCtx, ifNotExists: !!stmtNode.ifNotExists() };
        return await this.#storageEngine.createTable(argument, queryCtx.schemaName, _queryCtx);
    }

    async #evaluateALTER_TABLE_STMT(stmtNode, queryCtx) {
        // TODO notice
        throw new Error('ALTER TABLE is not supported yet in the in-memory StorageEngine');
        const tableName = stmtNode.name().value();
        const argument = stmtNode.argument();
        const ifNotExists = !!stmtNode.ifNotExists();
        return await this.#storageEngine.alterTable(tableName, argument, !ifNotExists, queryCtx);
    }

    async #evaluateDROP_TABLE_STMT(stmtNode, queryCtx) {
        if (stmtNode.myTemporaryKW()) {
            throw new Error('MySQL TEMPORARY tables are not supported yet in the in-memory StorageEngine');
        }
        const tableNames = stmtNode.names().map((n) => [n.value(), n.qualifier?.()?.value()]);
        const _queryCtx = { ...queryCtx, ifExists: !!stmtNode.ifExists(), cascade: stmtNode.cascadeRule() === 'CASCADE' };
        let returnValue;
        for (const [tableName, schemaName] of tableNames) {
            returnValue = await this.#storageEngine.dropTable(tableName, schemaName, _queryCtx);
        }
        return returnValue;
    }

    // -------- CTE

    async #evaluateCTE(stmtNode, queryCtx) {
        // Declare CTEs while inheriting super CTEs
        const cteRegistry = new Map(queryCtx.cteRegistry || []);
        queryCtx = { ...queryCtx, cteRegistry };
        // Evaluate...
        for (const cteItem of stmtNode.declarations()) {
            const cteName = cteItem.alias().value();
            if (cteRegistry?.has(cteName)) {
                throw new Error(`CTE name ${cteName} already exists in the current context`);
            }
            const itemBody = cteItem.expr();
            const cteStream = await this.#evaluateSTMT(itemBody, queryCtx);
            cteRegistry.set(cteName, cteStream);
        }
        return await this.#evaluateSTMT(stmtNode.body(), queryCtx);
    }

    // -------- DML

    async #evaluateINSERT_STMT(stmtNode, queryCtx) {
        const _ = {};
        if (!Array.isArray(_.originSchemas = stmtNode.originSchemas())) throw new Error('Expected a pre-resolved query object with originSchemas() returning an array');
        // Resolve schema/table spec
        const schemaName = stmtNode.tableRef().qualifier()?.value(); // undefined defaults to defaultSchemaName in storage engine
        const tableName = stmtNode.tableRef().value();
        const tableAlias = stmtNode.pgTableAlias()?.value() || tableName;
        const tableSchema = _.originSchemas[0];
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
                for (let [i, valExpr] of rowConstructor.entries().entries()) {
                    const colName = columnNames[i];
                    const colSchema = definedColumns[colName];
                    if (valExpr instanceof registry.DefaultLiteral) {
                        const defaultConstraint = colSchema.defaultConstraint();
                        if (defaultConstraint) valExpr = defaultConstraint.expr();
                    }
                    const colValue = await this.#exprEngine.evaluate(valExpr, defaultContext, queryCtx);
                    this.#acquireValue(record, colSchema, colValue);
                }
                records.push(record);
            }
        }
        // ----------- b. select_clause | my_table_clause
        else if ((_.selectClause = stmtNode.selectClause())
            || (_.myTableClause = stmtNode.myTableClause())) {
            const _queryCtx = { ...queryCtx, depth: queryCtx.depth + 1 };
            const stream = _.myTableClause
                ? this.#evaluateTABLE_STMT(_.myTableClause, _queryCtx)
                : await this.#evaluateSTMT(_.selectClause, _queryCtx); // Can be any of the three SELECT_STMT types
            for await (const _record of stream) {
                const record = { ...defaultRecord };
                for (const [colIdx, colValue] of Object.values(_record).entries()) {
                    const targetColName = columnNames[colIdx];
                    const colSchema = definedColumns[targetColName];
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
            const renderedLogicalRecord = await this.#renderSetClause({ [tableAlias]: defaultRecord }, _.mySetClause, null, queryCtx);
            records.push(renderedLogicalRecord[tableAlias]);
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
                finalizedRecord = await this.#storageEngine.insert(tableName, record, schemaName, queryCtx);
            } catch (e) {
                // TODO: Assertain conflict target
                if (e instanceof ConflictError && conflictHandlingClause?.length) {
                    if (conflictHandlingClause.whereClause?.()
                        && !await this.evaluateWhereClause(conflictHandlingClause.whereClause(), [{ [tableAlias]: e.existing }], queryCtx)) {
                        finalizedRecord = null;
                    } else {
                        const newLogicalRecord = await this.#renderSetClause({ [tableAlias]: e.existing, EXCLUDED: record }, conflictHandlingClause, _.originSchemas, queryCtx);
                        finalizedRecord = await this.#storageEngine.update(tableName, newLogicalRecord[tableAlias], schemaName, queryCtx);
                    }
                } else if (e instanceof ConflictError && conflictHandlingClause?.doNothingKW?.()) {
                    finalizedRecord = null;
                } else throw e;
            }
            // Process RETURNING clause
            if (returningClause) {
                if (finalizedRecord) {
                    const _record = Object.create(null);
                    const outputRecordContext = { [tableAlias]: finalizedRecord };
                    for (const selectItem of returningClause) {
                        const { alias, value } = await this.#exprEngine.evaluate(selectItem, outputRecordContext, queryCtx);
                        _record[alias] = value;
                    }
                    returnList.push(_record);
                }
            } else rowCount++;
        }

        // Number | array
        if (!returningClause) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    async #evaluateUPDATE_STMT(stmtNode, queryCtx) {
        const _ = {};
        if (!Array.isArray(_.originSchemas = stmtNode.originSchemas())) throw new Error('Expected a pre-resolved query object with originSchemas() returning an array');
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
                const schemaName = tableRef.qualifier()?.value(); // undefined defaults to defaultSchemaName in storage engine
                return [tableAlias, tableName, schemaName];
            });
        } else {
            const tableExpr = stmtNode.tableExpr();
            // Derive FromItems and JoinClauses
            fromItems = [tableExpr];
            joinClauses = (stmtNode.pgFromClause()?.entries() || []).concat(stmtNode.joinClauses() || []);
            // Derive update targets
            const schemaName = tableExpr.tableRef().qualifier()?.value(); // undefined defaults to defaultSchemaName in storage engine
            const tableName = tableExpr.tableRef().value();
            const tableAlias = tableExpr.alias()?.value() || tableName;
            updateTargets = [
                [tableAlias, tableName, schemaName],
            ];
        }

        // FROM -> composites
        let stream = await this.evaluateFromItems(fromItems, joinClauses, _.originSchemas, queryCtx);
        if (_.whereClause = stmtNode.whereClause()) {
            stream = this.evaluateWhereClause(_.whereClause, stream, queryCtx);
        }

        // 3. Exec updates
        let rowCount = 0;
        const returnList = [];
        const returningClause = stmtNode.returningClause();
        const setClause = stmtNode.setClause();
        for await (const logicalRecord of stream) {
            // Exec update
            const newLogicalRecord = await this.#renderSetClause(logicalRecord, setClause, _.originSchemas, queryCtx);
            for (const [tableAlias, tableName, schemaName] of updateTargets) {
                if (newLogicalRecord[tableAlias] === logicalRecord[tableAlias]) continue;
                newLogicalRecord[tableAlias] = await this.#storageEngine.update(tableName, newLogicalRecord[tableAlias], schemaName, queryCtx);
            }
            // Process RETURNING clause
            if (returningClause) {
                const _record = Object.create(null);
                for (const selectItem of returningClause) {
                    const { alias, value } = await this.#exprEngine.evaluate(selectItem, newLogicalRecord, queryCtx);
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!returningClause) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    async #evaluateDELETE_STMT(stmtNode, queryCtx) {
        const _ = {};
        if (!Array.isArray(_.originSchemas = stmtNode.originSchemas())) throw new Error('Expected a pre-resolved query object with originSchemas() returning an array');
        // Derive FromItems and JoinClauses
        let fromItems, joinClauses, deleteTargets;
        if (_.myDeleteList = stmtNode.myDeleteList()) {
            // Derive FromItems and JoinClauses
            fromItems = (stmtNode.myFromClause() || stmtNode.usingClause())?.entries() || [];
            joinClauses = stmtNode.joinClauses() || [];
            // Derive update targets
            const _combinedFromItems = [...fromItems, ...joinClauses];
            deleteTargets = _.myDeleteList.map((item) => {
                const fromItem = _combinedFromItems.find((fi) => (fi.alias() || fi.expr()).identifiesAs(item));
                const tableRef = fromItem.expr();
                const tableName = tableRef.value?.();
                if (!tableName) throw new Error(`Cannot delete from ${item}; ${fromItem} isn't a table reference.`);
                const schemaName = tableRef.qualifier()?.value();
                return [item.value(), tableName, schemaName];
            });
        } else {
            const tableExpr = stmtNode.tableExpr();
            // Derive FromItems and JoinClauses
            fromItems = [tableExpr];
            joinClauses = (stmtNode.pgUsingClause()?.entries() || []).concat(stmtNode.joinClauses() || []);
            // Derive update targets
            const tableRef = tableExpr.tableRef();
            const tableName = tableRef.value();
            const tableAlias = tableExpr.alias()?.value() || tableName;
            const schemaName = tableRef.qualifier()?.value();
            deleteTargets = [
                [tableAlias, tableName, schemaName],
            ];
        }

        // FROM -> composites
        let stream = await this.evaluateFromItems(fromItems, joinClauses, _.originSchemas, queryCtx);
        if (_.whereClause = stmtNode.whereClause()) {
            stream = this.evaluateWhereClause(_.whereClause, stream, queryCtx);
        }

        // 3. Exec updates
        let rowCount = 0;
        const returnList = [];
        const returningClause = stmtNode.returningClause();
        for await (let logicalRecord of stream) {
            for (const [tableAlias, tableName, schemaName] of deleteTargets) {
                logicalRecord[tableAlias] = await this.#storageEngine.delete(tableName, logicalRecord[tableAlias], schemaName, queryCtx);
            }
            // Process RETURNING clause
            if (returningClause) {
                const _record = Object.create(null);
                for (const selectItem of returningClause) {
                    const { alias, value } = await this.#exprEngine.evaluate(selectItem, logicalRecord, queryCtx);
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!returningClause) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    async #renderSetClause(logicalRecord, setClause, originSchemas, queryCtx) {
        const newLogicalRecord = { ...logicalRecord };
        const baseAlias = Object.keys(logicalRecord)[0];

        const acquireValue = async (tableAlias, colName, valExpr) => {
            if (valExpr instanceof registry.DefaultLiteral) {
                const colSchema = originSchemas.find((os) => os.identifiesAs(tableAlias)).columns().find((col) => col.identifiesAs(colName));
                const defaultConstraint = colSchema.defaultConstraint();
                if (defaultConstraint) valExpr = defaultConstraint.expr();
            }
            const colValue = await this.#exprEngine.evaluate(valExpr, logicalRecord, queryCtx);
            newLogicalRecord[tableAlias] = { ...newLogicalRecord[tableAlias], [colName]: colValue };
        };

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
                    await acquireValue(baseAlias, colName, correspondingRight);
                }
            } else {
                const colName = left.value();
                const qualif = left.qualifier?.()?.value() || baseAlias;
                await acquireValue(qualif, colName, right);
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

    async * #evaluateTABLE_STMT(stmtNode, queryCtx) {
        // Resolve schema/table spec
        const tableRef = stmtNode.tableRef();
        const tableName = tableRef.value();
        const schemaName = tableRef.qualifier()?.value(); // undefined defaults to defaultSchemaName in storage engine
        // Exedute table scan
        yield* this.#storageEngine.getCursor(tableName, schemaName);
    }

    async * #evaluateSELECT_STMT(stmtNode, queryCtx) {
        const _ = {};
        if (!Array.isArray(_.originSchemas = stmtNode.originSchemas())) throw new Error('Expected a pre-resolved query object with originSchemas() returning an array');

        // 1. FROM -> composites, WHERE
        let stream = await this.evaluateFromClause(
            stmtNode.fromClause(),
            stmtNode.joinClauses(),
            _.originSchemas,
            queryCtx
        );

        if (_.whereClause = stmtNode.whereClause()) {
            stream = this.evaluateWhereClause(_.whereClause, stream, queryCtx);
        }

        // 3. Grep aggr and window functions
        const aggrFunctions = [];
        const winFunctions = [];
        stmtNode.walkTree((v) => {
            if (v instanceof registry.DerivedQuery
                || v instanceof registry.ScalarSubquery) return;
            if (v instanceof registry.AggrCallExpr) {
                if (v.overClause()) winFunctions.push(v);
                else aggrFunctions.push(v);
            } else return v;
        });

        // 4. GROUPING / aggregates
        const groupByClause = stmtNode.groupByClause();
        const havingClause = stmtNode.havingClause();
        const selectList = stmtNode.selectList();

        if (groupByClause?.length) {
            const groupingElements = this.#resolveScopedRefsInClause(groupByClause, selectList);
            stream = this.evaluateGroupByClause(groupingElements, havingClause, stream, queryCtx);
        } else if (aggrFunctions.length) {
            stream = this.evaluateGlobalGroup(stream);
        }

        // 5. WINDOWING
        if (winFunctions.length) {
            const windowDefs = new Map(stmtNode.windowClause()?.entries().map((w) => [w.name().value(), w.spec()]) || []);
            stream = this.evaluateWindowing(winFunctions, windowDefs, stream, queryCtx);
        }

        // 5. ORDER BY (materialize) then LIMIT
        const orderByClause = stmtNode.orderByClause?.(); // Not implemented by BasicSelectStmt
        if (orderByClause) {
            const orderElements = this.#resolveScopedRefsInClause(orderByClause, selectList);
            stream = this.evaluateOrderByClause(orderElements, stream, queryCtx);
        }

        // 4. SELECT (projection) -- always works on compositeRecords
        stream = this.evaluateSelectList(selectList, stream, queryCtx);

        // 6. LIMIT + OFFSET
        const limitClause = stmtNode.limitClause?.(); // Not implemented by BasicSelectStmt
        const offsetClause = stmtNode.offsetClause?.(); // Not implemented by BasicSelectStmt
        if (limitClause || offsetClause) stream = this.evaluateLimitClause(limitClause, offsetClause, stream, queryCtx);

        yield* stream;
    }

    async evaluateFromClause(fromClause, joinClauses, originSchemas, queryCtx) {
        if (!fromClause?.length) return (async function* () { yield { ...(queryCtx.lateralCtx || {}) }; })();
        return await this.evaluateFromItems(fromClause.entries(), joinClauses, originSchemas, queryCtx);
    }

    async evaluateFromItems(fromEntries, joinClauses, originSchemas, queryCtx) {
        // combine base from entries then join clauses in order
        const allItems = [...fromEntries, ...(joinClauses || [])];
        // start with first item
        const firstItem = allItems[0];
        const firstItemAlias = firstItem.alias?.()?.value();
        const _originSchema = (aliasName) => originSchemas.find((os) => !aliasName ? !os.name?.() : os.identifiesAs(aliasName));
        let leftStream = this.evaluateFromItem(firstItem, _originSchema(firstItemAlias), queryCtx);

        // progressively join subsequent items
        for (let idx = 1; idx < allItems.length; idx++) {
            const rightItem = allItems[idx];
            const rightAlias = rightItem.alias?.()?.value();
            const rightSchema = _originSchema(rightAlias);

            // buffer right side composites
            let createRightStream;
            const isLateral = rightItem.lateralKW?.();
            if (isLateral) {
                createRightStream = (_lateralCtx) => this.evaluateFromItem(rightItem, rightSchema, { ...queryCtx, lateralCtx: _lateralCtx });
            } else {
                const rightStream = this.evaluateFromItem(rightItem, rightSchema, { ...queryCtx, lateralCtx: null });
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
            const joinType = rightItem.joinType?.() || (fromEntries.includes(rightItem) ? 'CROSS' : 'INNER');
            let joinCondition = rightItem.conditionClause?.();
            if (!joinCondition && rightItem.naturalKW?.()) {
                const leftAlias = allItems[idx - 1].alias?.()?.value();
                const leftSchema = _originSchema(leftAlias);
                const lCols = leftSchema.columns?.() || leftSchema.entries();
                const rCols = rightSchema.columns?.() || rightSchema.entries();
                const columns = rCols.reduce((all, rc) => {
                    if (!lCols.find((lc) => lc.identifiesAs(rc))) return all;
                    return all.concat({ value: rc.name().value(), delim: rc._get('delim') });
                }, []);
                if (columns.length) {
                    joinCondition = registry.UsingClause.fromJSON({ columns }, { assert: true });
                }
            }

            // join
            leftStream = this.evaluateJoin(leftStream, { alias: rightAlias, isLateral }, createRightStream, joinType, joinCondition, originSchemas, queryCtx);
        }

        return leftStream;
    }

    async * evaluateFromItem(fromItem, originSchema, queryCtx) {
        // ---------- a. TableAbstraction2 | TableAbstraction1

        if (fromItem instanceof registry.TableAbstraction2
            || fromItem instanceof registry.TableAbstraction1) {
            const tableRef = fromItem.tableRef();
            const tableAlias = fromItem.alias();
            // Part2 resolution: table scan
            const schemaName = tableRef.qualifier()?.value(); // undefined defaults to defaultSchemaName in storage engine
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
            for await (const row of await this.#evaluateSTMT(fromItemExpr.expr(), queryCtx)) {
                const entries = Object.entries(row);
                const actualColWidth = entries.length;
                if (actualColWidth !== expectedColWidth) {
                    throw new Error(`Expected number of columns from DerivedQuery function to be ${expectedColWidth} but got ${actualColWidth}`);
                }
                const _row = Object.create(null);
                for (const [key, value] of entries) {
                    this.#acquireValue(_row, originSchema._get('entries', key), value);
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
                for (const [i, valExpr] of rowConstructor.entries().entries()) {
                    this.#acquireValue(row, originSchema.entries()[i], await this.#exprEngine.evaluate(valExpr, queryCtx.lateralCtx, queryCtx));
                }
                yield { [aliasName]: row };
            }
            return;
        }

        const createSRFGenerator = async (callExpr) => {
            const funcResult = await this.#exprEngine.evaluate(callExpr, queryCtx.lateralCtx, queryCtx);
            let asyncIter;
            if (Symbol.asyncIterator in funcResult) {
                asyncIter = funcResult[Symbol.asyncIterator]();
            } else if (Symbol.iterator in funcResult) {
                asyncIter = (async function* () { yield* funcResult; })();
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
            for await (const row of await createSRFGenerator2(callExpr, qualif.columnDefs())) {
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
                    this.#acquireValue(_row, originSchema.entries()[i], values[i]);
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
            for await (const row of await createSRFGenerator(callExpr)) {
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
                    this.#acquireValue(_row, originSchema.entries()[i], values[i]);
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
                const stream = await createSRFGenerator2(callExpr, qualif?.columnDefs());
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
                            this.#acquireValue(row, originSchema.entries()[colIdx], value);
                            colIdx++;
                        }
                    } else {
                        // Fill with nulls for this SRF
                        for (let j = 0; j < (colWidths[i] || 1); j++) {
                            this.#acquireValue(row, originSchema.entries()[colIdx], null, true);
                            colIdx++;
                        }
                    }
                }
                if (allDone) break;
                // Handle ordinality
                if (withOrdinality) {
                    this.#acquireValue(row, originSchema.entries()[colIdx], rowIdx + 1);
                    colIdx++;
                }
                // Yield
                yield { [aliasName]: row };
                rowIdx++;
            }
            return;
        }

        // ---------- TableRef1 | TableRef2
        const schemaName = fromItemExpr.qualifier()?.value(); // undefined defaults to defaultSchemaName in storage engine
        const tableName = fromItemExpr.value();

        // CTERef?
        let stream;
        if (fromItemExpr.resolution() === 'cte') {
            stream = queryCtx.cteRegistry?.get(tableName);
            if (!stream) throw new Error(`Implied CTE ${tableName} does not exist in the current context`);
            if (typeof stream[Symbol.asyncIterator] !== 'function') throw new Error(`Implied CTE ${tableName} does not return a record set`);
        } else {
            stream = this.#storageEngine.getCursor(tableName, schemaName);
        }

        // Consume stream
        let colWidth = null;
        for await (const row of stream) {
            const entries = Object.entries(row);
            const actualColWidth = entries.length;
            if (actualColWidth !== expectedColWidth) {
                throw new Error(`Expected number of columns from ${aliasName} to be ${expectedColWidth} but got ${actualColWidth}`);
            }
            const _row = Object.create(null);
            for (const [key, value] of entries) {
                this.#acquireValue(_row, originSchema._get('entries', key), value);
            }
            yield { ...(queryCtx.lateralCtx || {}), [aliasName]: _row };
        }
    }

    async * evaluateJoin(leftStream, { alias: rightAlias, isLateral }, createRightStream, joinType, joinCondition, originSchemas, queryCtx) {
        const _originSchema = (aliasName) => originSchemas.find((os) => os.identifiesAs(aliasName));
        // Composition helpers
        const nullFill = (baseComp, aliases) => {
            for (const alias of aliases) {
                if (baseComp[alias]) continue;
                const originSchema = _originSchema(alias);
                const columns = originSchema.columns?.() || originSchema.entries();
                baseComp[alias] = Object.fromEntries(columns.map((col) => [col.name().value(), null]));
            }
            return baseComp;
        };

        const leftAliasSet = new Set;
        const rightMatches = new Map;

        // The JOIN
        for await (const leftComp of leftStream) {
            for (const k of Object.keys(leftComp)) leftAliasSet.add(k);

            let leftMatched = false;
            for await (const rightComp of createRightStream(leftComp)) {
                const fullMergedComp = { ...leftComp, ...rightComp };

                const rightRef = () => _rightRef || (_rightRef = isLateral ? JSON.stringify(rightComp) : rightComp);
                let _rightRef;

                if (!joinCondition/* Also: CROSS JOIN */
                    || await this.#exprEngine.evaluate(joinCondition, fullMergedComp, queryCtx)) {
                    leftMatched = true;
                    rightMatches.set(rightRef(), true);
                    yield fullMergedComp;
                } else if ((joinType === 'RIGHT' || joinType === 'FULL') && !rightMatches.has(rightRef())) {
                    rightMatches.set(rightRef(), false);
                }
            }

            if (!leftMatched && (joinType === 'LEFT' || joinType === 'FULL')) {
                yield nullFill({ ...leftComp }, [rightAlias]);
            }
        }

        if (joinType === 'RIGHT' || joinType === 'FULL') {
            for (let [rightComp, matched] of rightMatches.entries()) {
                if (matched) continue;
                if (typeof rightComp === 'string') rightComp = JSON.parse(rightComp);
                yield nullFill({ ...rightComp }, [...leftAliasSet]);
            }
        }
    }

    async * evaluateWhereClause(whereClause, upstream, queryCtx) {
        for await (const comp of upstream) {
            if (await this.#exprEngine.evaluate(whereClause.expr(), comp, queryCtx)) yield comp;
        }
    }

    async * evaluateGroupByClause(groupingElements, havingClause, upstream, queryCtx) {

        // -----------Utils:

        function flattenRowConstructor(expr) {
            if (expr instanceof registry.RowConstructor) {
                // Flatten each entry recursively
                return expr.entries().flatMap(flattenRowConstructor);
            }
            return [expr];
        }

        function expandElement(elem) {
            if (elem.groupingSets()) return elem.groupingSets().flatMap(expandElement);
            if (elem.rollupSet()) {
                const entries = elem.rollupSet().entries();
                const sets = [];
                for (let i = entries.length; i >= 0; i--) sets.push(entries.slice(0, i).flatMap(flattenRowConstructor));
                return sets;
            }
            if (elem.cubeSet()) {
                const entries = elem.cubeSet().entries();
                const n = entries.length;
                const sets = [];
                for (let mask = 0; mask < (1 << n); mask++) {
                    const subset = [];
                    for (let j = 0; j < n; j++) if (mask & (1 << j)) subset.push(entries[j]);
                    sets.push(subset.flatMap(flattenRowConstructor));
                }
                return sets;
            }
            if (elem.expr()) return [flattenRowConstructor(elem.expr())];
            return [[]]; // fallback
        }

        function getAtomicExprs(elem) {
            if (elem.groupingSets()) return elem.groupingSets().flatMap(getAtomicExprs);
            if (elem.rollupSet()) return [...elem.rollupSet().entries()];
            if (elem.cubeSet()) return [...elem.cubeSet().entries()];
            if (elem.expr()) {
                const e = elem.expr();
                return e instanceof registry.RowConstructor ? e.entries() : [e];
            }
            return [];
        }

        // ------------ Processing:

        let groupingSets;
        if (groupingElements.every(e => e.expr() && !e.rollupSet() && !e.cubeSet() && !e.groupingSets())) {
            // plain multi-column GROUP BY
            groupingSets = [groupingElements.flatMap(e => expandElement(e)[0])];
        } else {
            // includes GROUPING SETS / ROLLUP / CUBE
            groupingSets = groupingElements.flatMap(expandElement);
        }

        // Build mapping ExprNode → top-level index
        const topEntryAtomicMap = new Map();
        for (let j = 0; j < groupingElements.length; j++) {
            const atomic = getAtomicExprs(groupingElements[j]);
            topEntryAtomicMap.set(j, atomic);
        }

        const groups = new Map();
        for await (const comp of upstream) {
            for (let setIndex = 0; setIndex < groupingSets.length; setIndex++) {
                const set = groupingSets[setIndex];

                const keyVals = set.length
                    ? await Promise.all(set.map((expr) => this.#exprEngine.evaluate(expr, comp, queryCtx)))
                    : [];

                // Compute mask for GROUPING_ID
                let mask = 0;
                for (let j = 0; j < groupingElements.length; j++) {
                    const atomic = topEntryAtomicMap.get(j) || [];
                    if (atomic.length === 0) {
                        mask |= (1 << j);
                        continue;
                    }
                    let allPresent = atomic.every((aExpr) => set.includes(aExpr));
                    if (!allPresent) mask |= (1 << j);
                }

                const key = JSON.stringify([setIndex, keyVals]);
                if (!groups.has(key)) {
                    groups.set(key, { window: [], mask, setIndex, keyVals, set });
                }
                groups.get(key).window.push(comp);
            }
        }

        // Yield representative rows
        for (const { window, mask, setIndex, keyVals, set } of groups.values()) {
            const rep = {};

            // Build lightweight groupingColumnsMap: Map<alias, Set<colName>>
            const groupingColumnsMap = new Map();
            const _add = (colRef) => {
                const alias = colRef.qualifier()?.value() || '';
                const set = groupingColumnsMap.get(alias) ?? new Set();
                set.add(colRef.value());
                groupingColumnsMap.set(alias, set);
            };
            // Scan set and build groupingColumnsMap
            for (const expr of set) {
                if (expr instanceof registry.ColumnRef1) _add(expr); else {
                    expr.walkTree((child) => {
                        if (child instanceof registry.ColumnRef1) _add(child);
                        return child;
                    });
                }
            }

            // Build exprToTopIndex per grouping set for GROUPING_ID evaluation
            const exprToTopIndex = new Map();
            for (let j = 0; j < groupingElements.length; j++) {
                const atomic = topEntryAtomicMap.get(j) || [];
                for (const exprNode of atomic) exprToTopIndex.set(exprNode, j);
            }

            // Column-level nulling
            for (const alias of Object.keys(window[0])) {
                const tableRow = { ...window[0][alias] };
                for (const colName of Object.keys(tableRow)) {
                    const isGrouped = groupingColumnsMap.get(alias)?.has(colName);
                    if (!isGrouped) tableRow[colName] = null;
                }
                rep[alias] = tableRow;
            }

            // Metadata
            rep[GROUPING_META] = {
                window: window,
                frameStart: 0,
                frameEnd: window.length - 1,
                groupValues: keyVals,
                groupingId: mask,
                setIndex,
                exprIndex: exprToTopIndex,
                isGrandTotal: set.length === 0,
                groupingColumnsMap
            };

            // Apply HAVING
            if (havingClause) {
                const keep = await this.#exprEngine.evaluate(havingClause.expr(), rep, queryCtx);
                if (!keep) continue;
            }

            yield rep;
        }
    }

    async * evaluateGlobalGroup(upstream) {
        const window = [];
        for await (const comp of upstream) window.push(comp);
        // representative: first member or empty composite
        const rep = window[0] ? { ...window[0] } : {};

        // attach grouping metadata
        rep[GROUPING_META] = {
            window: window,
            frameStart: 0,
            frameEnd: window.length - 1,
            groupValues: [],
            groupingId: 0,
            setIndex: 0,
            exprIndex: new Map()
        };

        yield rep;
    }

    async * evaluateWindowing(winFunctions, windowDefs, upstream, queryCtx) {
        const rows = Array.isArray(upstream) ? upstream : [];
        if (!Array.isArray(upstream)) for await (const r of upstream) rows.push(r);
        // Group window functions by their resolved 'effective spec'
        const winFnMap = new Map(); // winHash -> { winFn, effectiveSpec }

        for (const winFn of winFunctions) {
            const over = winFn.overClause();

            let effectiveSpec;
            if (over instanceof registry.WindowRef) {
                const namedSpec = windowDefs.get(over.value());
                if (!namedSpec) throw new Error(`[${winFn}] Window '${over.value()}' not found`);
                effectiveSpec = {
                    partitionBy: namedSpec.partitionByClause(),
                    orderBy: namedSpec.orderByClause(),
                    frameSpec: namedSpec.frameSpec(),
                };
            } else if (over instanceof registry.WindowSpec) {
                const baseSpec = over.superWindow() ? windowDefs.get(over.superWindow().value()) : null;
                effectiveSpec = {
                    partitionBy: over.partitionByClause() ?? baseSpec?.partitionByClause(),
                    orderBy: over.orderByClause() ?? baseSpec?.orderByClause(),
                    frameSpec: over.frameSpec() ?? baseSpec?.frameSpec(),
                };
            }

            const winHash = JSON.stringify(effectiveSpec); // simple stable hash
            if (!winFnMap.has(winHash)) winFnMap.set(winHash, effectiveSpec);
            winFn.winHash = winHash;
        }

        // Partition rows per window function
        for (const [winHash, effectiveSpec] of winFnMap.entries()) {
            // Partition rows by PARTITION BY expression(s)
            const partitions = new Map(); // key -> rows[]

            const rowsAreReps = !!rows[0]?.[GROUPING_META];
            const rowToRepMap = new WeakMap;
            for (let row of rows) {
                const originalRep = row;
                let originalRow = row;
                if (rowsAreReps) {
                    // Rep rows may have nulled columns 
                    // we fall back origianl rep row
                    originalRow = { ...row[GROUPING_META].window[0] };
                    rowToRepMap.set(originalRow, originalRep);
                }
                const keyVals = await Promise.all(effectiveSpec.partitionBy?.map((expr) => this.#exprEngine(expr, originalRow, queryCtx)) ?? []);
                const key = JSON.stringify(keyVals);
                if (!partitions.has(key)) {
                    const window = [];
                    partitions.set(key, window);
                }
                partitions.get(key).push(originalRow);
            }

            // Populate WINDOW_META for each row
            for (let window of partitions.values()) {

                // Apply ORDER BY if present
                if (effectiveSpec.orderBy) {
                    const ordered = this.evaluateOrderByClause(effectiveSpec.orderBy.entries(), window, queryCtx, true);
                    const orderedArray = [];
                    for await (const decorated of ordered) orderedArray.push(decorated);
                    window = orderedArray;
                }

                // Attach meta
                let i = 0;
                const isDecorated = !!effectiveSpec.orderBy;
                for (const entry of window) {
                    const { row, keys } = isDecorated ? entry : { row: entry, keys: [i] };
                    const originalRep = rowsAreReps ? rowToRepMap.get(row) : row;

                    // Compute frame start/end for this row
                    const {
                        frameStart,
                        frameEnd
                    } = this.#computeFrameBounds(effectiveSpec, window, i, isDecorated);

                    if (!originalRep[WINDOW_META]) originalRep[WINDOW_META] = {};
                    originalRep[WINDOW_META][winHash] = {
                        window: isDecorated ? window.map((d) => d.row) : window,
                        orderKeysHash: JSON.stringify(keys),
                        orderKeys: keys,
                        offset: i++,
                        frameStart,
                        frameEnd,
                    };
                }
            }
        }

        yield* rows;
    }

    #computeFrameBounds(effectiveSpec, window, rowIndex, isDecorated = false) {
        const frameSpec = effectiveSpec.frameSpec;
        const total = window.length;

        // Default frame = full partition
        if (!frameSpec) {
            return { frameStart: 0, frameEnd: total - 1 };
        }

        const specifier = frameSpec.specifier();
        const [start, end] = frameSpec.bounds() ?? [];

        let frameStart = 0;
        let frameEnd = total - 1;

        // helper to clamp safely
        const clamp = (n) => Math.min(Math.max(n, 0), total - 1);

        // ----- ROWS -----
        if (specifier === 'ROWS') {
            // --- Start ---
            if (!start || start.specifier() === 'CURRENT ROW') {
                frameStart = rowIndex;
            } else if (start.specifier() === 'UNBOUNDED' && start.dir() === 'PRECEDING') {
                frameStart = 0;
            } else if (start.specifier() instanceof registry.NumberLiteral) {
                const n = start.specifier().value();
                frameStart = clamp(
                    start.dir() === 'PRECEDING' ? rowIndex - n : rowIndex + n
                );
            }

            // --- End ---
            if (!end || end.specifier() === 'CURRENT ROW') {
                frameEnd = rowIndex;
            } else if (end.specifier() === 'UNBOUNDED' && end.dir() === 'FOLLOWING') {
                frameEnd = total - 1;
            } else if (end.specifier() instanceof registry.NumberLiteral) {
                const n = end.specifier().value();
                frameEnd = clamp(
                    end.dir() === 'FOLLOWING' ? rowIndex + n : rowIndex - n
                );
            }
        }

        // ----- RANGE -----
        else if (specifier === 'RANGE') {
            if (!effectiveSpec.orderBy) {
                return { frameStart: 0, frameEnd: total - 1 };
            }

            const getKeys = (entry) => isDecorated ? entry.keys : [rowIndex];
            const myKeys = getKeys(window[rowIndex]);
            const myValue = myKeys[0]; // leading ORDER BY key

            const getValue = (entry) => isDecorated ? entry.keys[0] : rowIndex;

            // Peer range by default
            let peerStart = rowIndex;
            while (peerStart > 0 && getValue(window[peerStart - 1]) === myValue) peerStart--;
            let peerEnd = rowIndex;
            while (peerEnd < total - 1 && getValue(window[peerEnd + 1]) === myValue) peerEnd++;

            frameStart = peerStart;
            frameEnd = peerEnd;

            const adjustBound = (bound, isStart) => {
                if (!bound) return;

                if (bound.specifier() === 'UNBOUNDED' && bound.dir() === 'PRECEDING') {
                    frameStart = 0;
                } else if (bound.specifier() === 'UNBOUNDED' && bound.dir() === 'FOLLOWING') {
                    frameEnd = total - 1;
                } else if (bound.specifier() === 'CURRENT ROW') {
                    if (isStart) frameStart = peerStart;
                    else frameEnd = peerEnd;
                } else if (bound.specifier() instanceof registry.NumberLiteral) {
                    // numeric RANGE offset
                    const n = bound.specifier().value();
                    const ref = myValue + (bound.dir() === 'FOLLOWING' ? n : -n);
                    if (isStart) {
                        let idx = 0;
                        while (idx < total && getValue(window[idx]) < ref) idx++;
                        frameStart = idx;
                    } else {
                        let idx = total - 1;
                        while (idx >= 0 && getValue(window[idx]) > ref) idx--;
                        frameEnd = idx;
                    }
                } else if (bound.specifier() instanceof registry.TypedIntervalLiteral) {
                    const refTime = new Date(myValue).getTime();
                    const shifted = bound.specifier().applyToDate(new Date(refTime), bound.dir());

                    if (isStart) {
                        let idx = 0;
                        while (idx < total && new Date(getValue(window[idx])).getTime() < shifted) idx++;
                        frameStart = idx;
                    } else {
                        let idx = total - 1;
                        while (idx >= 0 && new Date(getValue(window[idx])).getTime() > shifted) idx--;
                        frameEnd = idx;
                    }
                }
            };

            adjustBound(start, true);
            adjustBound(end, false);
        }

        // ----- GROUPS -----
        else if (specifier === 'GROUPS') {
            if (!effectiveSpec.orderBy) {
                // no ORDER BY → one peer group (all rows)
                return { frameStart: 0, frameEnd: total - 1 };
            }

            const getHash = (entry) => {
                return isDecorated
                    ? JSON.stringify(entry.keys)
                    : JSON.stringify([rowIndex]);
            };

            // Build groups of peer rows by orderKeys
            const groups = [];
            let currentGroup = [0];
            let lastHash = getHash(window[0]);

            for (let i = 1; i < total; i++) {
                const h = getHash(window[i]);
                if (h === lastHash) {
                    currentGroup.push(i);
                } else {
                    groups.push(currentGroup);
                    currentGroup = [i];
                    lastHash = h;
                }
            }
            groups.push(currentGroup);

            // Find current row's group index
            const groupIndex = groups.findIndex((g) => g.includes(rowIndex));

            let startGroup = groupIndex;
            let endGroup = groupIndex;

            if (start) {
                if (start.specifier() === 'UNBOUNDED' && start.dir() === 'PRECEDING') {
                    startGroup = 0;
                } else if (start.specifier() === 'CURRENT ROW') {
                    startGroup = groupIndex;
                } else if (start.specifier() instanceof registry.NumberLiteral) {
                    const n = start.specifier().value();
                    startGroup = clamp(groupIndex - n);
                }
            }

            if (end) {
                if (end.specifier() === 'UNBOUNDED' && end.dir() === 'FOLLOWING') {
                    endGroup = groups.length - 1;
                } else if (end.specifier() === 'CURRENT ROW') {
                    endGroup = groupIndex;
                } else if (end.specifier() instanceof registry.NumberLiteral) {
                    const n = end.specifier().value();
                    endGroup = clamp(groupIndex + n);
                }
            }

            frameStart = groups[startGroup][0];
            frameEnd = groups[endGroup][groups[endGroup].length - 1];
        }

        return { frameStart, frameEnd };
    }

    async * evaluateSelectList(selectList, upstream, queryCtx) {
        for await (const comp of upstream) {
            const projected = Object.create(null);
            let fieldIdx = 1;
            for (const selectItem of selectList) {
                let { alias, value } = await this.#exprEngine.evaluate(selectItem, comp, queryCtx);
                if (projected[alias] && queryCtx.depth) alias += fieldIdx;
                projected[alias] = value;
                fieldIdx++;
            }
            yield projected;
        }
    }

    #resolveScopedRefsInClause(clause, selectList) {
        return clause.entries().map((entry) => {
            let refedExpr;
            if (entry.expr() instanceof registry.NumberLiteral) {
                if (!(refedExpr = selectList.entries()[parseInt(entry.expr().value()) - 1]?.expr())) {
                    throw new Error(`[${clause}] The reference by offset ${entry.expr().value()} does not resolve to a select list entry`);
                }
            } else if (entry.expr()?.resolution?.() === 'scope') {
                refedExpr = selectList.entries().find((si, i) => si.alias()?.identifiesAs(entry.expr()))?.expr();
            }
            if (refedExpr) {
                entry = entry.constructor.fromJSON({ ...entry.jsonfy(), expr: refedExpr.jsonfy() }, { assert: true });
                clause._adoptNodes(entry);
            }
            return entry;
        });
    }

    async * evaluateOrderByClause(orderElements, upstream, queryCtx, withKeys = false) {
        const rows = Array.isArray(upstream) ? upstream : [];
        if (!Array.isArray(upstream)) for await (const r of upstream) rows.push(r);
        // Precompute keys
        const decorated = await Promise.all(rows.map(async (row) => {
            const keys = await Promise.all(orderElements.map(orderElement =>
                this.#exprEngine.evaluate(orderElement.expr(), row, queryCtx)
            ));
            return { row, keys };
        }));
        // Sort synchronously
        this.#exprEngine.applySorting(decorated, orderElements, queryCtx);
        // Extract rows back
        for (const d of decorated) {
            if (withKeys) yield d;
            else yield d.row;
        }
    }

    async * evaluateLimitClause(limitClause, offsetClause, upstream, queryCtx) {
        const limit = limitClause ? await this.#exprEngine.evaluate(limitClause.expr(), {}, queryCtx) : 0;
        const offset = offsetClause ? await this.#exprEngine.evaluate(offsetClause.expr(), {}, queryCtx) : (
            limitClause.myOffset() ? await this.#exprEngine.evaluate(limitClause.myOffset(), {}, queryCtx) : 0
        );
        let idx = 0, yielded = 0;
        for await (const r of upstream) {
            if (idx++ < offset) continue;
            if (limit && yielded++ >= limit) break;
            yield r;
        }
    }

    // -------- Composite select (UNION / INTERSECT / EXCEPT) support

    async * #evaluateCOMPOSITE_SELECT_STMT(stmtNode, queryCtx) {

        const self = this;
        async function* evaluateOperand(operand) {
            if (operand instanceof registry.SelectStmt) {
                yield* await self.#evaluateSTMT(operand, { ...queryCtx, depth: queryCtx.depth + 1 });
                return;
            }
            if (operand instanceof registry.TableStmt) {
                yield* self.#evaluateTABLE_STMT(operand, { ...queryCtx, depth: queryCtx.depth + 1 });
                return;
            }
            const resultSchema = operand.resultSchema();
            let operandJson = operand.jsonfy();
            if (operand instanceof registry.ValuesConstructor) {
                operandJson = { ...operandJson, nodeName: 'VALUES_TABLE_LITERAL' };
            }
            const fromItem = registry.FromItem.fromJSON({ nodeName: 'FROM_ITEM', expr: operandJson }, { dialect: self.#options.dialect, assert: true });
            stmtNode._adoptNodes(fromItem);
            const result = self.evaluateFromItem(fromItem, resultSchema, queryCtx);
            for await (const r of result) yield r[''];
        };

        const leftStream = await evaluateOperand(stmtNode.left());
        const rightStream = await evaluateOperand(stmtNode.right());

        // Normalize

        const leftRows = [];
        const rightRows = [];
        for await (const r of leftStream) leftRows.push(r);
        for await (const r of rightStream) rightRows.push(r);

        const leftOutputCols = stmtNode.left().resultSchema?.().entries() || [];
        const rightOutputCols = stmtNode.right().resultSchema?.().entries() || [];
        if (leftOutputCols.length !== rightOutputCols.length) {
            throw new Error(`Set operation column mismatch: left has ${leftOutputCols.length} columns, right has ${rightOutputCols.length}`);
        }

        const mappers = leftOutputCols.map((leftCol, i) => {
            const rightCol = rightOutputCols[i];
            const leftType = leftCol.dataType().value();
            const rightType = rightCol.dataType().value();
            const coercedType = this.#resolveCommonType(leftType, rightType);
            const name = leftCol.name().value() ?? `col${i + 1}`;
            return { name, coercedType };
        });

        const coercedLeft = [];
        const coercedRight = [];
        for (const r of leftRows) coercedLeft.push(this.#coerceRowToAliases(r, mappers));
        for (const r of rightRows) coercedRight.push(this.#coerceRowToAliases(r, mappers));

        // Perform set operation

        const operator = stmtNode.operator();
        const modifier = stmtNode.allOrDistinct() || 'DISTINCT';

        let resultRows = [];
        const rowHash = (row) => {
            // Create a stable row key where:
            // - null and undefined are treated the same
            // - NaN becomes the string '__NaN__'
            // - objects/arrays are stringified consistently
            return JSON.stringify(Object.values(row), (k, v) => {
                if (v === undefined || v === null) return { __sql_null__: true };
                if (typeof v === 'number' && Number.isNaN(v)) return { __sql_NaN__: true };
                return v;
            });
        };

        const hashSymbol = Symbol('hash');
        const count = (arr) => {
            const counts = new Map();
            for (const r of arr) {
                const k = r[hashSymbol] ?? (r[hashSymbol] = rowHash(r));
                counts.set(k, (counts.get(k) || 0) + 1);
            }
            return counts;
        };

        if (operator === 'UNION') {
            if (modifier === 'ALL') {
                resultRows = [...coercedLeft, ...coercedRight];
            } else {
                // DISTINCT: merge left then right deduping by key (left wins)
                const map = new Map();
                for (const r of coercedLeft) map.set(rowHash(r), r);
                for (const r of coercedRight) {
                    const k = rowHash(r);
                    if (!map.has(k)) map.set(k, r);
                }
                resultRows = Array.from(map.values());
            }
        } else if (operator === 'INTERSECT') {
            // INTERSECT keeps only rows present on both sides.
            // For ALL, we must preserve multiplicities: produce as many occurrences as min(countLeft, countRight)
            const leftCount = count(coercedLeft);
            const rightCount = count(coercedRight);

            if (modifier === 'ALL') {
                for (const [k, nLeft] of leftCount.entries()) {
                    const nRight = rightCount.get(k) || 0;
                    const times = Math.min(nLeft, nRight);
                    const exemplar = coercedLeft.find(r => rowHash(r) === k);
                    for (let i = 0; i < times; i++) resultRows.push({ ...exemplar });
                }
            } else {
                // DISTINCT INTERSECT
                for (const k of leftCount.keys()) {
                    if (rightCount.has(k)) {
                        const exemplar = coercedLeft.find(r => rowHash(r) === k);
                        resultRows.push({ ...exemplar });
                    }
                }
            }
        } else if (operator === 'EXCEPT') {
            // EXCEPT: rows in left not in right.
            // For ALL: multiplicity = max(0, countLeft - countRight)
            const leftCount = count(coercedLeft);
            const rightCount = count(coercedRight);

            if (modifier === 'ALL') {
                for (const [k, nLeft] of leftCount.entries()) {
                    const nRight = rightCount.get(k) || 0;
                    const times = Math.max(0, nLeft - nRight);
                    const exemplar = coercedLeft.find(r => rowHash(r) === k);
                    for (let i = 0; i < times; i++) resultRows.push({ ...exemplar });
                }
            } else {
                // DISTINCT EXCEPT
                for (const k of leftCount.keys()) {
                    if (!rightCount.has(k)) {
                        const exemplar = coercedLeft.find(r => rowHash(r) === k);
                        resultRows.push({ ...exemplar });
                    }
                }
            }
        }

        // ORDER BY / LIMIT / OFFSET

        const orderByClause = stmtNode.orderByClause();
        if (orderByClause) resultRows = await this.evaluateSetOpOrderByClause(orderByClause.entries(), resultRows, queryCtx);

        const limitClause = stmtNode.limitClause();
        const offsetClause = stmtNode.offsetClause();
        if (limitClause || offsetClause) resultRows = await this.evaluateSetOpLimitClause(limitClause, offsetClause, resultRows, queryCtx);

        yield* resultRows;
    }

    #coerceRowToAliases(row, mappers) {
        // Coerce a projected row (object with aliases) into canonical object with mappers order.
        // Uses Object.values(row) to respect projection order emitted by evaluateSelectList.
        const values = Object.values(row);
        const coerced = Object.create(null);
        for (let i = 0; i < mappers.length; i++) {
            const { name, coercedType } = mappers[i];
            let val = values[i];
            // Minimal coercion rules (extend this as you add type metadata)
            if (coercedType === 'numeric') {
                if (typeof val === 'string' && val !== '' && !isNaN(+val)) val = +val;
            } else if (coercedType === 'text') {
                if (val != null && typeof val !== 'string') val = String(val);
            }
            // Normalize undefined -> null for consistent equality semantics
            if (val === undefined) val = null;
            coerced[name] = val;
        }
        return coerced;
    }

    #resolveCommonType(leftType, rightType) {
        // Minimal common type resolver
        if (!leftType && !rightType) return null;
        if (!leftType) return rightType;
        if (!rightType) return leftType;
        if (leftType === rightType) return leftType;

        const numeric = new Set(['smallint', 'integer', 'bigint', 'numeric', 'decimal', 'float', 'double']);
        if (numeric.has(leftType) && numeric.has(rightType)) return 'numeric';
        if (leftType === 'text' || rightType === 'text') return 'text';
        if (leftType === 'boolean' && rightType === 'boolean') return 'boolean';
        // fallback to leftType (conservative)
        return leftType;
    }

    async evaluateSetOpOrderByClause(orderElements, resultRows, queryCtx) {
        // Precompute keys
        const decorated = await Promise.all(resultRows.map(async (row) => {
            const keys = await Promise.all(orderElements.map(orderElement => {
                let refedValue;
                const throwRefError = () => { throw new Error(`[ORDER BY] The reference by offset ${orderElement.expr()} does not resolve to a select list entry`); };
                if (orderElement.expr() instanceof registry.NumberLiteral) {
                    const values = Object.values(row);
                    const index = orderElement.expr().value() - 1;
                    if (index < 0 || index >= values.length) throwRefError();
                    return values[index];
                }
                if (orderElement.expr()?.resolution?.() === 'scope') {
                    if ((refedValue = row[orderElement.expr().value()]) === undefined) throwRefError();
                    return refedValue;
                }
                return this.#exprEngine.evaluate(orderElement.expr(), { ...(queryCtx.lateralCtx || {}), [' ']: row }, queryCtx)
            }));
            return { row, keys };
        }));
        // Sort synchronously
        this.#exprEngine.applySorting(decorated, orderElements, queryCtx);
        return decorated.map((e) => e.row);
    }

    async evaluateSetOpLimitClause(limitClause, offsetClause, resultRows, queryCtx) {
        const limit = limitClause ? await this.#exprEngine.evaluate(limitClause.expr(), {}, queryCtx) : 0;
        const offset = offsetClause ? await this.#exprEngine.evaluate(offsetClause.expr(), {}, queryCtx) : (
            limitClause.myOffset() ? await this.#exprEngine.evaluate(limitClause.myOffset(), {}, queryCtx) : 0
        );
        return resultRows.slice(offset, limit ? offset + limit : undefined);
    }
}
