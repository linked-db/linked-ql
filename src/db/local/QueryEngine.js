import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ConflictError } from './ConflictError.js';
import { ExprEngine } from './ExprEngine.js';
import { registry } from '../../lang/registry.js';

export const GROUP_SYMBOL = Symbol.for('group');

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
                    result = await self.#evaluateSTMT(
                        derivedQuery.expr(),
                        { ...queryCtx, lateralCtx: { ...(queryCtx.lateralCtx || {}), ...compositeRow } }
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
                yield * result;
            },
            this.#options,
        );
    }

    // -------- ENTRY

    async query(scriptNode, options = {}) {
        const events = [];
        const txId = `$tx${(0 | Math.random() * 9e6).toString(36)}`;
        const queryCtx = { options, txId, lateralCtx: null, cteRegistry: new Map };
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
                for (const [i, valueExpr] of rowConstructor.entries().entries()) {
                    const colName = columnNames[i];
                    const colValue = await this.#exprEngine.evaluate(valueExpr, defaultContext, queryCtx);
                    const colSchema = definedColumns[colName];
                    this.#acquireValue(record, colSchema, colValue);
                }
                records.push(record);
            }
        }
        // ----------- b. select_clause | my_table_clause
        else if ((_.selectClause = stmtNode.selectClause())
            || (_.myTableClause = stmtNode.myTableClause())) {
            const stream = _.myTableClause
                ? await this.#evaluateTABLE_STMT(_.myTableClause, queryCtx)
                : await this.#evaluateSELECT_STMT(_.selectClause, queryCtx);
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
            const renderedLogicalRecord = await this.#renderSetClause({ [tableAlias]: defaultRecord }, _.mySetClause, queryCtx);
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
                        const newLogicalRecord = await this.#renderSetClause({ [tableAlias]: e.existing, EXCLUDED: record }, conflictHandlingClause, queryCtx);
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
            const newLogicalRecord = await this.#renderSetClause(logicalRecord, setClause, queryCtx);
            for (const [tableAlias, tableName, schemaName] of updateTargets) {
                if (newLogicalRecord[tableAlias] === logicalRecord[tableAlias]) continue;
                await this.#storageEngine.update(tableName, newLogicalRecord[tableAlias], schemaName, queryCtx);
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
        for await (const logicalRecord of stream) {
            for (const [tableAlias, tableName, schemaName] of deleteTargets) {
                await this.#storageEngine.delete(tableName, logicalRecord[tableAlias], schemaName, queryCtx);
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

    async #renderSetClause(logicalRecord, setClause, queryCtx) {
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
                    const colValue = await this.#exprEngine.evaluate(correspondingRight, logicalRecord, queryCtx);
                    newLogicalRecord[baseAlias] = { ...newLogicalRecord[baseAlias], [colName]: colValue };
                }
            } else {
                const colName = left.value();
                const qualif = left.qualifier?.()?.value() || baseAlias;
                const colValue = await this.#exprEngine.evaluate(right, logicalRecord, queryCtx);
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

    async *#evaluateTABLE_STMT(stmtNode, queryCtx) {
        // Resolve schema/table spec
        const tableRef = stmtNode.tableRef();
        const tableName = tableRef.value();
        const schemaName = tableRef.qualifier()?.value(); // undefined defaults to defaultSchemaName in storage engine
        // Exedute table scan
        yield* this.#storageEngine.getCursor(tableName, schemaName);
    }

    async *#evaluateSELECT_STMT(stmtNode, queryCtx) {
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

        // 3. GROUPING / aggregates
        const groupByClause = stmtNode.groupByClause();
        const havingClause = stmtNode.havingClause();
        const selectList = stmtNode.selectList();
        if (groupByClause?.length) {
            const groupingElements = this.#resolveScopedRefsInClause(groupByClause, selectList);
            stream = this.evaluateGroupByClause(groupingElements, havingClause, stream, queryCtx);
        } else {
            stmtNode.walkTree((v) => {
                if (_.hasAggrFunctions) return;
                if (v instanceof registry.DerivedQuery
                    || v instanceof registry.ScalarSubquery) return;
                if (v instanceof registry.AggrCallExpr) {
                    _.hasAggrFunctions = true;
                } else return v;
            });
            if (_.hasAggrFunctions) {
                stream = this.evaluateGlobalGroup(stream);
            }
        }

        // 5. ORDER BY (materialize) then LIMIT
        const orderByClause = stmtNode.orderByClause();
        if (orderByClause) {
            const orderElements = this.#resolveScopedRefsInClause(orderByClause, selectList);
            stream = this.evaluateOrderByClause(orderElements, stream, queryCtx);
        }

        if (!queryCtx.cteRegistry) console.log(queryCtx);
        // 4. SELECT (projection) -- always works on compositeRecords
        stream = this.evaluateSelectList(selectList, stream, queryCtx);

        // 6. LIMIT + OFFSET
        const limitClause = stmtNode.limitClause();
        const offsetClause = stmtNode.offsetClause();
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
                for (const [i, valueExpr] of rowConstructor.entries().entries()) {
                    this.#acquireValue(row, originSchema.entries()[i], await this.#exprEngine.evaluate(valueExpr, queryCtx.lateralCtx, queryCtx));
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

    evaluateGroupByClause(groupingElements, havingClause, upstream, queryCtx) {
        const self = this;
        return (async function* () {
            const groups = new Map; // key -> array of compositeRecords

            for await (const comp of upstream) {
                // compute grouping key (use exprEngine)
                const keyParts = [];
                for (const groupingElement of groupingElements) {
                    keyParts.push(await self.#exprEngine.evaluate(groupingElement.expr(), comp, queryCtx));
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
                    if (await self.#exprEngine.evaluate(havingClause.expr(), rep, queryCtx)) yield rep;
                } else yield rep;
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

    async * evaluateSelectList(selectList, upstream, queryCtx) {
        for await (const comp of upstream) {
            const projected = Object.create(null);
            for (const selectItem of selectList) {
                const { alias, value } = await this.#exprEngine.evaluate(selectItem, comp, queryCtx);
                projected[alias] = value;
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
            } else if (entry.expr().resolution?.() === 'scope') {
                refedExpr = selectList.entries().find((si, i) => si.alias()?.identifiesAs(entry.expr()))?.expr();
            }
            if (refedExpr) {
                entry = entry.constructor.fromJSON({ ...entry.jsonfy(), expr: refedExpr.jsonfy() }, { assert: true });
                clause._adoptNodes(entry);
            }
            return entry;
        });
    }

    async * evaluateOrderByClause(orderElements, upstream, queryCtx) {
        const rows = [];
        for await (const r of upstream) rows.push(r);
        // Precompute keys
        const decorated = await Promise.all(rows.map(async (row) => {
            const keys = await Promise.all(orderElements.map(orderElement =>
                this.#exprEngine.evaluate(orderElement.expr(), row, queryCtx)
            ));
            return { row, keys };
        }));
        // Sort synchronously
        decorated.sort((a, b) => {
            for (let i = 0; i < orderElements.length; i++) {
                const idDesc = orderElements[i].dir() === 'DESC';
                const dir = idDesc ? -1 : 1;
                const nullsSpec = orderElements[i].nullsSpec()
                    || (this.#options.dialect === 'mysql' ? (idDesc ? 'LAST' : 'FIRST') : (idDesc ? 'FIRST' : 'LAST'));

                const valA = a.keys[i];
                const valB = b.keys[i];
                const aIsNull = valA === null; // Explicit NULL check
                const bIsNull = valB === null;

                // 1. Handle NULL vs. NULL (Always equal)
                if (aIsNull && bIsNull) continue; // Move to next order element

                // 2. Handle NULL vs. Non-NULL
                if (aIsNull || bIsNull) {
                    // Determine the NULLs order required by the SQL dialect/spec
                    // If NULLS FIRST:
                    //   - A is NULL, B is NOT: A comes first (return -1)
                    //   - B is NULL, A is NOT: B comes first (return 1)
                    if (nullsSpec === 'FIRST') {
                        if (aIsNull) return -1; // A comes first
                        if (bIsNull) return 1;  // A comes after B
                    }
                    // If NULLS LAST:
                    //   - A is NULL, B is NOT: A comes last (return 1)
                    //   - B is NULL, A is NOT: B comes last (return -1)
                    else { // NULLS LAST
                        if (aIsNull) return 1;  // A comes after B
                        if (bIsNull) return -1; // A comes before B
                    }
                }

                // 3. Handle Non-NULL vs. Non-NULL (Original logic)
                // Ensure comparison is safe for potentially non-numeric/string values if needed
                if (valA < valB) return -dir;
                if (valA > valB) return dir;
            }
            return 0;
        });
        // Extract rows back
        for (const d of decorated) yield d.row;
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
}
