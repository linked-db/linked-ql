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

    // ---------------- top-level query/dispatcher (async generator) ----------------
    async *query(scriptJson) {
        let returnValue;
        for (const stmtJson of (scriptJson.nodeName === 'SCRIPT' && scriptJson.entries || [scriptJson])) {
            switch (stmtJson.nodeName) {
                case 'BASIC_SELECT_STMT':
                case 'COMPLETE_SELECT_STMT':
                    returnValue = await this.SELECT(stmtJson);
                    break;
                case 'TABLE_STMT':
                    returnValue = await this.TABLE(stmtJson);
                    break;
                case 'INSERT_STMT':
                    returnValue = await this.INSERT(stmtJson);
                    break;
                case 'UPDATE_STMT':
                    returnValue = await this.UPDATE(stmtJson);
                    break;
                case 'DELETE_STMT':
                    returnValue = await this.DELETE(stmtJson);
                    break;
                default:
                    throw new Error(`Unknown statement type: ${stmtJson.nodeName}`);
            }
        }
        return returnValue;
    }

    // ---------------- top-level INSERT ----------------
    async INSERT(stmtJson) {
        if (stmtJson?.nodeName !== 'INSERT_STMT') {
            throw new Error('Only INSERT_STMT statements are supported here');
        }

        // Resolve schema/table spec
        const schemaName = stmtJson.table_ref.qualifier?.value;
        const tableName = stmtJson.table_ref.value;
        const tableAlias = stmtJson.pg_table_alias?.value || '';
        const tableSchema = await this.#storageEngine.tableSchema(tableName, schemaName);

        // Resolve column names
        const definedColumns = Object.fromEntries(tableSchema.columns().map((col) => [col.name().value(), col]));
        const columnNames = stmtJson.column_list?.entries.map((col) => col.value)
            || Object.keys(definedColumns);

        // Resolve defaults and constraints
        const defaultRecord = Object.create(null);
        for (const [colName, colSchema] of Object.entries(definedColumns)) {
            defaultRecord[colName] = null;
            let _cons;
            if (_cons = colSchema.defaultConstraint()) {
                defaultRecord[colName] = this.#exprEngine.evaluate(_cons.expr().jsonfy());
            }
        }

        // Build records
        const records = [];
        // ----------- a. values_clause
        if (stmtJson.values_clause?.entries.length) {
            for (const row_constructor of stmtJson.values_clause.entries) {
                const record = { ...defaultRecord };
                records.push(record);
                for (const [i, valueExpr] of row_constructor.entries.entries()) {
                    const colName = columnNames[i];
                    const colValue = this.#exprEngine.evaluate(valueExpr);
                    this.#acquireValue(record, colName, colValue, definedColumns);
                }
            }
        }
        // ----------- b. select_clause | my_table_clause
        else if (stmtJson.select_clause || stmtJson.my_table_clause) {
            const result = stmtJson.my_table_clause
                ? this.TABLE(stmtJson.my_table_clause)
                : this.SELECT(stmtJson.select_clause);
            for await (const _record of result) {
                const record = { ...defaultRecord };
                records.push(record);
                for (const [colName, colValue] of Object.entries(_record)) {
                    this.#acquireValue(record, colName, colValue, definedColumns);
                }
            }
        }
        // ----------- c. pg_default_values_clause
        else if (stmtJson.pg_default_values_clause) {
            const record = { ...defaultRecord };
            records.push(record);
        }
        // ----------- d. my_set_clause
        else if (stmtJson.my_set_clause) {
            const record = this.#renderSetClause({ [tableAlias]: defaultRecord }, stmtJson.my_set_clause);
            records.push(record);
        }

        // Dispatch to DB
        let rowCount = 0;
        const returnList = [];
        for (const record of records) {
            // Exec insert / update
            let finalizedRecord;
            try {
                finalizedRecord = await this.#storageEngine.insert(tableName, record, schemaName);
            } catch (e) {
                if (e instanceof ConflictError && stmtJson.conflict_handling_clause) {
                    const newLogicalRecord = this.#renderSetClause({ [tableAlias]: e.existing }, stmtJson.conflict_handling_clause);
                    finalizedRecord = await this.#storageEngine.update(tableName, newLogicalRecord[tableAlias], schemaName);
                } else throw e;
            }
            // Process RETURNING clause
            if (stmtJson.returning_clause?.entries) {
                const _record = Object.create(null);
                for (const selectItem of stmtJson.returning_clause.entries) {
                    const { alias, value } = this.#exprEngine.evaluate(selectItem, { [tableAlias]: finalizedRecord });
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!stmtJson.returning_clause?.entries) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    // ---------------- top-level UPDATE ----------------
    async UPDATE(stmtJson) {
        if (stmtJson?.nodeName !== 'UPDATE_STMT') {
            throw new Error('Only UPDATE_STMT statements are supported here');
        }

        // Derive FromItems and JoinClauses
        let fromItems, joinClauses, updateTargets;
        if (stmtJson.my_update_list?.length) {
            // Derive FromItems and JoinClauses
            fromItems = stmtJson.my_update_list.map((item) => ({ alias: item.alias, expr: item.table_ref }));
            joinClauses = stmtJson.join_clauses || [];
            // Derive update targets
            updateTargets = fromItems.concat(joinClauses).map((item) => {
                return [item.alias?.value || item.expr.value, item.expr.value, item.expr.qualifier?.value];
            });
        } else {
            const tableExpr = stmtJson.table_expr;
            // Derive FromItems and JoinClauses
            fromItems = [{ alias: null, expr: tableExpr.table_ref }];
            joinClauses = (stmtJson.pg_from_clause?.entries || []).concat(stmtJson.join_clauses || []);
            // Derive update targets
            const schemaName = tableExpr.table_ref.qualifier?.value;
            const tableName = tableExpr.table_ref.value;
            const tableAlias = tableExpr.alias?.value || '';
            updateTargets = [
                [tableAlias, tableName, schemaName],
            ];
        }

        // FROM -> composites
        let stream = await this.evaluateFromItems(fromItems, joinClauses);
        if (stmtJson.where_clause) {
            stream = this.evaluateWhereClause(stmtJson.where_clause, stream);
        }

        // 3. Exec updates
        let rowCount = 0;
        const returnList = [];
        for await (const logicalRecord of stream) {
            // Exec update
            const newLogicalRecord = this.#renderSetClause(logicalRecord, stmtJson.set_clause);
            for (const [tableAlias, tableName, schemaName] of updateTargets) {
                if (newLogicalRecord[tableAlias] === logicalRecord[tableAlias]) continue;
                await this.#storageEngine.update(tableName, newLogicalRecord[tableAlias], schemaName);
            }
            // Process RETURNING clause
            if (stmtJson.returning_clause?.entries) {
                const _record = Object.create(null);
                for (const selectItem of stmtJson.returning_clause.entries) {
                    const { alias, value } = this.#exprEngine.evaluate(selectItem, newLogicalRecord);
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!stmtJson.returning_clause?.entries) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    // ---------------- top-level DELETE ----------------
    async DELETE(stmtJson) {
        if (stmtJson?.nodeName !== 'DELETE_STMT') {
            throw new Error('Only DELETE_STMT statements are supported here');
        }

        // Derive FromItems and JoinClauses
        let fromItems, joinClauses, deleteTargets;
        if (stmtJson.my_delete_list?.length) {
            // Derive FromItems and JoinClauses
            fromItems = stmtJson.my_delete_list.map((item) => ({ alias: null, expr: item.table_ref }));
            joinClauses = []
                .concat((stmtJson.my_from_clause || stmtJson.using_clause)?.entries || [])
                .concat(stmtJson.join_clauses || []);
            // Derive update targets
            deleteTargets = fromItems.map((item) => {
                return [item.expr.value, item.expr.value, item.expr.qualifier?.value];
            });
        } else {
            const tableExpr = stmtJson.table_expr;
            // Derive FromItems and JoinClauses
            fromItems = [{ alias: null, expr: tableExpr.table_ref }];
            joinClauses = (stmtJson.pg_using_clause?.entries || []).concat(stmtJson.join_clauses || []);
            // Derive update targets
            const schemaName = tableExpr.table_ref.qualifier?.value;
            const tableName = tableExpr.table_ref.value;
            const tableAlias = tableExpr.alias?.value || '';
            deleteTargets = [
                [tableAlias, tableName, schemaName],
            ];
        }

        // FROM -> composites
        let stream = await this.evaluateFromItems(fromItems, joinClauses);
        if (stmtJson.where_clause) {
            stream = this.evaluateWhereClause(stmtJson.where_clause, stream);
        }

        // 3. Exec updates
        let rowCount = 0;
        const returnList = [];
        for await (const logicalRecord of stream) {
            for (const [tableAlias, tableName, schemaName] of deleteTargets) {
                await this.#storageEngine.delete(tableName, logicalRecord[tableAlias], schemaName);
            }
            // Process RETURNING clause
            if (stmtJson.returning_clause?.entries) {
                const _record = Object.create(null);
                for (const selectItem of stmtJson.returning_clause.entries) {
                    const { alias, value } = this.#exprEngine.evaluate(selectItem, logicalRecord);
                    _record[alias] = value;
                }
                returnList.push(_record);
            } else rowCount++;
        }

        // Number | array
        if (!stmtJson.returning_clause?.entries) return rowCount;
        return (async function* () { yield* returnList; })();
    }

    #renderSetClause(logicalRecord, setClauseJson) {
        const newLogicalRecord = { ...logicalRecord };
        const baseAlias = Object.keys(logicalRecord)[0];
        for (const assignmentExpr of setClauseJson.entries) {
            if (assignmentExpr.left.nodeName === 'COLUMN_CONSTRUCTOR') {
                if (assignmentExpr.right.nodeName !== 'ROW_CONSTRUCTOR') {
                    throw new Error(`A RHS of ROW_CONSTRUCTOR is expected for a LHS of COLUMN_CONSTRUCTOR, but got ${assignmentExpr.right.nodeName}`);
                }
                for (const [i, { value: colName }] of assignmentExpr.left.entries.entries()) {
                    const colValue = this.#exprEngine.evaluate(assignmentExpr.left.entries[i], logicalRecord);
                    newLogicalRecord[baseAlias] = { ...newLogicalRecord[baseAlias], [colName]: colValue };
                }
            } else {
                const colName = assignmentExpr.left.value;
                const qualif = assignmentExpr.left.qualifier?.value || baseAlias;
                const colValue = this.#exprEngine.evaluate(assignmentExpr.right, logicalRecord);
                newLogicalRecord[qualif] = { ...newLogicalRecord[qualif], [colName]: colValue };
            }
        }
        return newLogicalRecord;
    }

    #acquireValue(record, colName, colValue, definedColumns) {
        record[colName] = colValue;
        return record;
        // TODO
        const colSchema = definedColumns[colName];
        if ((!colSchema.identityConstraint() && !colSchema.autoIncrementConstraint())
            && ((_cons = colSchema.nullConstraint()) && _cons.value() === 'NOT')) {
            requireds.add(colName);
        }
        return inputValue;
    }

    // ---------------- top-level TABLE (async generator) ----------------
    async *TABLE(stmtJson) {
        if (stmtJson?.nodeName !== 'TABLE_STMT') {
            throw new Error('Only TABLE_STMT statements are supported here');
        }
        // Resolve schema/table spec
        const schemaName = stmtJson.table_ref.qualifier?.value;
        const tableName = stmtJson.table_ref.value;

        yield* this.#storageEngine.getCursor(tableName, schemaName);
    }

    // ---------------- top-level SELECT (async generator) ----------------
    async *SELECT(stmtJson) {
        if (!['BASIC_SELECT_STMT', 'COMPLETE_SELECT_STMT'].includes(stmtJson?.nodeName)) {
            throw new Error('Only BASIC_SELECT_STMT | COMPLETE_SELECT_STMT statements are supported here');
        }
        // 1. FROM -> composites
        let stream = this.evaluateFromClause(stmtJson.from_clause, stmtJson.join_clauses);

        // 2. WHERE
        if (stmtJson.where_clause) stream = this.evaluateWhereClause(stmtJson.where_clause, stream);

        // 3. GROUPING / aggregates
        const hasGroup = !!(stmtJson.group_by_clause?.entries?.length);
        const hasAggInSelect = this._selectHasAggregate(stmtJson.select_clause);

        if (hasGroup) {
            // evaluateGroupByClause returns composites (representatives) already filtered by HAVING if provided
            stream = this.evaluateGroupByClause(stmtJson.group_by_clause, stream, stmtJson.having_clause);
        } else if (!hasGroup && hasAggInSelect) {
            // global-group: aggregate without GROUP BY -> single representative composite with GROUP_SYMBOL
            stream = this.evaluateGlobalGroup(stream);
        }

        // 4. SELECT (projection) -- always works on compositeRecords
        stream = this.evaluateSelectClause(stmtJson.select_clause, stream);

        // 5. ORDER BY (materialize) then LIMIT
        if (stmtJson.order_by_clause?.length) stream = this.evaluateOrderByClause(stmtJson.order_by_clause, stream);
        if (stmtJson.limit_clause) stream = this.evaluateLimitClause(stmtJson.limit_clause, stream);

        yield* stream;
    }

    // ---------------- FROM + JOIN ----------------
    async evaluateFromClause(fromClause, joinClauses = []) {
        if (!fromClause?.entries?.length) return (async function* () { yield {}; })();
        return await this.evaluateFromItems(fromClause.entries, joinClauses || []);
    }

    async *evaluateFromItem(fromItem) {
        // Derived query
        if (fromItem.expr?.nodeName === 'DERIVED_QUERY') {
            const alias = fromItem.alias?.value || '';
            for await (const subRow of this.query(fromItem.expr.expr)) {
                yield { [alias]: subRow };
            }
            return;
        }

        // Table scan
        const schemaName = fromItem.expr.qualifier?.value;
        const tableName = fromItem.expr.value;
        const alias = fromItem.alias?.value || tableName;
        for await (const row of this.#storageEngine.getCursor(tableName, schemaName)) {
            yield { [alias]: row }; // composite, no GROUP_SYMBOL
        }
    }

    async evaluateFromItems(fromEntries, joinClauses = []) {
        // combine base from entries then join clauses in order
        const allItems = [...fromEntries, ...(joinClauses || [])];
        // start with first item
        let leftStream = this.evaluateFromItem(allItems[0]);

        // progressively join subsequent items
        for (let idx = 1; idx < allItems.length; idx++) {
            const rightItem = allItems[idx];

            // buffer right side composites
            const rightBuffer = [];
            for await (const rc of this.evaluateFromItem(rightItem)) {
                rightBuffer.push(rc); // rc is composite { alias: row }
            }

            const joinType = rightItem.join_type || (fromEntries.includes(rightItem) ? 'CROSS' : 'INNER');
            const joinCondition = rightItem.condition_clause?.expr || null;

            leftStream = this.evaluateJoin(leftStream, rightBuffer, joinType, joinCondition);
        }

        return leftStream;
    }

    // nested-loop join; leftStream yields composites; rightBuffer is array of composites
    async *evaluateJoin(leftStream, rightBuffer, joinType = 'INNER', joinCondition = null) {
        const matchedRightIndexes = new Set();
        const leftAliasSet = new Set(); // collect left aliases to potentially null-fill right-only outputs

        for await (const leftComp of leftStream) {
            // capture left aliases seen so we can null-fill for right-only outputs if desired
            for (const k of Object.keys(leftComp)) leftAliasSet.add(k);

            let leftMatched = false;

            for (let ri = 0; ri < rightBuffer.length; ri++) {
                const rightComp = rightBuffer[ri];
                const merged = { ...leftComp, ...rightComp }; // composite merge via spreads

                let ok = true;
                if (joinCondition) ok = this.#exprEngine.evaluate(joinCondition, merged);

                if (ok) {
                    yield merged;                  // matched composite
                    leftMatched = true;
                    matchedRightIndexes.add(ri);
                }
            }

            // LEFT/FULL: if left had no match, emit left with right aliases null-filled
            if (!leftMatched && (joinType === 'LEFT' || joinType === 'FULL')) {
                // fill nulls for right aliases based on sample rightBuffer element keys
                const nullMerged = { ...leftComp };
                if (rightBuffer.length > 0) {
                    const sampleRight = rightBuffer[0];
                    for (const rk of Object.keys(sampleRight)) nullMerged[rk] = null;
                }
                yield nullMerged;
            }
        }

        // RIGHT/FULL: emit right-side rows that were never matched, optionally null-fill left aliases
        if (joinType === 'RIGHT' || joinType === 'FULL') {
            for (let ri = 0; ri < rightBuffer.length; ri++) {
                if (!matchedRightIndexes.has(ri)) {
                    const rightComp = rightBuffer[ri];
                    const out = { ...rightComp };
                    // optional: fill left aliases with null (if you want strict shape)
                    for (const lk of leftAliasSet) {
                        if (!(lk in out)) out[lk] = null;
                    }
                    yield out;
                }
            }
        }
    }

    // ---------------- WHERE ----------------
    async *evaluateWhereClause(whereClause, upstream) {
        for await (const comp of upstream) {
            if (this.#exprEngine.evaluate(whereClause.expr, comp)) yield comp;
        }
    }

    // ---------------- GROUP BY (yields compositeRecords, with GROUP_SYMBOL attached; applies HAVING if provided)
    evaluateGroupByClause(groupClause, upstream, havingClause = null) {
        const self = this;
        return (async function* () {
            const groups = new Map(); // key -> array of compositeRecords

            for await (const comp of upstream) {
                // compute grouping key (use exprEngine)
                const keyParts = [];
                for (let i = 0; i < groupClause.entries.length; i++) {
                    keyParts.push(self.#exprEngine.evaluate(groupClause.entries[i], comp));
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
                    if (self.#exprEngine.evaluate(havingClause.expr, rep)) yield rep;
                } else {
                    yield rep;
                }
            }
        })();
    }

    // ---------------- Global-group (for aggregates without GROUP BY) -> yields one rep composite with GROUP_SYMBOL
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

    // ---------------- SELECT ----------------
    async *evaluateSelectClause(selectClause, upstream) {
        // default SELECT *: flatten alias -> row mappings
        if (!selectClause?.entries?.length) {
            return upstream;
        }

        for await (const comp of upstream) {
            const projected = Object.create(null);
            for (let i = 0; i < selectClause.entries.length; i++) {
                const item = selectClause.entries[i];
                const { alias, value } = this.#exprEngine.evaluate(item, comp);
                projected[alias] = value;
            }
            yield projected;
        }
    }

    // ---------------- ORDER BY (materialize) ----------------
    async *evaluateOrderByClause(orderClause, upstream) {
        const rows = [];
        for await (const r of upstream) rows.push(r);

        rows.sort((a, b) => {
            for (let i = 0; i < orderClause.length; i++) {
                const clause = orderClause[i];
                const av = this.#exprEngine.evaluate(clause.expr, a);
                const bv = this.#exprEngine.evaluate(clause.expr, b);
                if (av < bv) return clause.direction === 'DESC' ? 1 : -1;
                if (av > bv) return clause.direction === 'DESC' ? -1 : 1;
            }
            return 0;
        });

        for (let i = 0; i < rows.length; i++) yield rows[i];
    }

    // ---------------- LIMIT ----------------
    async *evaluateLimitClause(limitClause, upstream) {
        const limit = limitClause.limit;
        const offset = limitClause.offset || 0;
        let idx = 0, yielded = 0;
        for await (const r of upstream) {
            if (idx++ < offset) continue;
            if (yielded++ >= limit) break;
            yield r;
        }
    }

    _selectHasAggregate(selectClause) {
        if (!selectClause?.entries?.length) return false;
        for (let i = 0; i < selectClause.entries.length; i++) {
            if (this._exprContainsAggregate(selectClause.entries[i].expr)) return true;
        }
        return false;
    }

    _exprContainsAggregate(expr) {
        if (!expr || typeof expr !== 'object') return false;
        if (expr.nodeName === 'AGGR_CALL_EXPR') {
            return true;
        }
        if (expr.arguments && Array.isArray(expr.arguments)) {
            for (let i = 0; i < expr.arguments.length; i++) {
                if (this._exprContainsAggregate(expr.arguments[i])) return true;
            }
        }
        if (expr.left && this._exprContainsAggregate(expr.left)) return true;
        if (expr.right && this._exprContainsAggregate(expr.right)) return true;
        if (expr.expr && this._exprContainsAggregate(expr.expr)) return true;
        return false;
    }
}
