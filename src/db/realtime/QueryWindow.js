import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ExprEngine } from "../l/ExprEngine.js";
import { matchExpr } from '../abstracts/util.js';
import { registry } from "../../lang/registry.js";
import { _eq } from "../../lang/abstracts/util.js";

export class QueryWindow extends SimpleEmitter {

    static analyseQuery(query) {

        const analysis = {
            hasSubqueryExprsInSelect: 0,
            hasSubqueryExprsInWhere: 0,
            hasSubqueryExprsInOrderBy: 0,
            hasSubqueryExprs: 0,
            hasWindowFunctions: false,
            hasAggrFunctions: false,
            hasGroupByClause: false,
            hasOrderByClause: false,
            hasOffsetClause: false,
            hasLimitClause: false,
            fromItemsBySchema: {},
            fromItemsByAlias: {},
            isSingleTable: false,
        };

        query.walkTree((n) => {
            // Aggregate expressions?
            if (n instanceof registry.AggrCallExpr) {
                if (n.overClause()) {
                    analysis.hasWindowFunctions = true;
                } else analysis.hasAggrFunctions = true;
            }
            // Subquery/derived query expresions?
            else if (n instanceof registry.DerivedQuery) {
                const relationHashes = new Set;
                grepFromItems(n.expr(), analysis.fromItemsBySchema, relationHashes);
                const resulutionLevel = relationHashes.size || !(n.expr() instanceof registry.SelectStmt)
                    ? 2 : (n.isCorrelated() ? 1 : 0);
                if (resulutionLevel === 0) return;
                // Publish
                if (analysis.hasSubqueryExprs < resulutionLevel) {
                    analysis.hasSubqueryExprs = resulutionLevel;
                }
                if (analysis.hasSubqueryExprsInSelect < resulutionLevel
                    && query.selectList().containsNode(n)) {
                    analysis.hasSubqueryExprsInSelect = resulutionLevel;
                } else if (analysis.hasSubqueryExprsInWhere < resulutionLevel
                    && query.whereClause()?.containsNode(n)) {
                    analysis.hasSubqueryExprsInWhere = resulutionLevel;
                } else if (analysis.hasSubqueryExprsInOrderBy < resulutionLevel
                    && query.orderByClause()?.containsNode(n)) {
                    analysis.hasSubqueryExprsInOrderBy = resulutionLevel;
                }
            }
            // Enter FromItem:
            else if (n instanceof registry.FromItem) {
                // Aliases are expected
                //  - except for a FROM (subquery) scenario, where it's optional
                const alias = n.alias()?.value() || '';
                if (n.expr() instanceof registry.DerivedQuery) {
                    const relationHashes = new Set;
                    grepFromItems(n.expr().expr(), analysis.fromItemsBySchema, relationHashes);
                    analysis.fromItemsByAlias[alias] = relationHashes;
                } else if (n.expr() instanceof registry.TableRef1
                    && n.expr().resolution() === 'default') {
                    const relationHashes = new Set;
                    acquireTableRef(n.expr(), analysis.fromItemsBySchema, relationHashes);
                    analysis.fromItemsByAlias[alias] = relationHashes;
                } else {
                    analysis.fromItemsByAlias[alias] = new Set;
                }
            } else return n;
        });

        function grepFromItems(query, fromItemsBySchema, relationHashes = null) {
            query.walkTree((n) => {
                if (n instanceof registry.FromItem
                    && n.expr() instanceof registry.TableRef1
                    && n.expr().resolution() === 'default') {
                    acquireTableRef(n.expr(), fromItemsBySchema, relationHashes);
                } else return n;
            });
        }

        function acquireTableRef(tableRef, fromItemsBySchema, relationHashes = null) {
            const tableName = tableRef.value();
            const schemaName = tableRef.qualifier().value(); // Both name and qualifier are expected
            fromItemsBySchema[schemaName] = [].concat(fromItemsBySchema[schemaName] || []).concat(tableName);
            if (relationHashes) relationHashes.add(JSON.stringify([schemaName, tableName]));
        }

        if (query.groupByClause()) analysis.hasGroupByClause = true;
        if (query.orderByClause()) analysis.hasOrderByClause = true;
        if (query.offsetClause()) analysis.hasOffsetClause = true;
        if (query.limitClause()) analysis.hasLimitClause = true;

        analysis.isSingleTable = !query.joinClauses()?.length
            && !(analysis.hasAggrFunctions || analysis.hasGroupByClause)
            && !analysis.hasWindowFunctions
            && analysis.hasSubqueryExprs !== 2
            && ((fromItems) => fromItems.length === 1 && !(fromItems[0].expr() instanceof registry.DerivedQuery))(query.fromClause()?.entries());

        return analysis;
    }

    static intersectQueries(query1, query2, subwindowingRules) {

        const specialClauses = [
            // projection
            'select_list',
            // filtering
            'where_clause',
            // windowing
            'order_by_clause',
            'offset_clause',
            'limit_clause'
        ];

        const clauses_a = new Set(query1._keys().filter((c) => !specialClauses.includes(c)));
        const clauses_b = new Set(query2._keys().filter((c) => !specialClauses.includes(c)));
        if (clauses_a.size !== clauses_b.size) return false;
        for (const clauseName of new Set([...clauses_a, ...clauses_b])) {
            if (!clauses_a.has(clauseName) || !clauses_b.has(clauseName)) return false;
            if (!matchExpr(query1._get(clauseName), query2._get(clauseName))) return false;
        }

        const selectMapping = [];
        if (subwindowingRules.projection === '=') {
            const selectItems_a = query1.selectList().entries();
            const selectItems_b = query2.selectList().entries();
            for (const b of selectItems_b) {
                const i_a = selectItems_a.findIndex((a) => matchExpr(a.expr(), b.expr()));
                if (i_a === -1) return false;
                selectMapping.push(i_a);
            }
        }

        const effectiveWhere = [];
        const aWhere = query1.whereClause()?.expr();
        const bWhere = query2.whereClause()?.expr();
        if (aWhere || bWhere) {
            if (subwindowingRules.whereClause === '>=') {
                const _effectiveWhere = matchExpr(aWhere, bWhere, 'AND~');
                if (_effectiveWhere === false) return false;
                effectiveWhere.push(..._effectiveWhere);
            } else if (!matchExpr(aWhere, bWhere)) return false;
        }

        const aOrd = query1.orderByClause()?.entries() || [];
        const bOrd = query2.orderByClause()?.entries() || [];
        if (subwindowingRules.ordinality === '=') {
            if (aOrd.length !== bOrd.length) return false;
            if (!aOrd.every((a, i) => matchExpr(a.expr(), bOrd[i].expr()))) return false;
            if (subwindowingRules.orderDirections === '=') {
                if (!aOrd.every((a, i) => matchExpr(a.dir(), bOrd[i].dir()))) return false;
            }
        }

        let effectiveOffset = 0;
        const aOffs = query1.offsetClause()?.expr();
        const bOffs = query2.offsetClause()?.expr();
        if (subwindowingRules.offsetClause === '=') {
            if ((aOffs || bOffs) && !matchExpr(aOffs, bOffs)) return;
        } else if (aOffs || bOffs) {
            if (!(bOffs instanceof registry.NumberLiteral)) return false;
            if ((effectiveOffset = bOffs.value() - (aOffs?.value() || 0)) < 0) return false;
        }

        const aLmt = query1.limitClause()?.expr();
        const bLmt = query2.limitClause()?.expr();
        if (subwindowingRules.limitClause === '=') {
            if ((aLmt || bLmt) && !matchExpr(aLmt, bLmt)) return;
        } else if (aLmt || bLmt) {
            if (!(bLmt instanceof registry.NumberLiteral)) return false;
            if (((aLmt?.value() || Infinity) - bLmt.value()) < 0) return false;
        }

        return { selectMapping, filters: effectiveWhere, offset: effectiveOffset };
    }

    // -----------------

    #driver;
    #options;

    #status = 0;
    #abortLine;

    #exprEngine;
    #queryCtx;

    #query;
    #queryJson;

    #analysis;
    #strategy = {
        ssr: false,
        requeryMode: 'selective',
        requeryWrappedSelectivity: false,
        diffing: 'key',
    };
    #subwindowingRules = {
        projection: '~',
        whereClause: '>=',
        ordinality: '~',
        orderDirections: '~',
        offsetClause: '>=',
        limitClause: '<=',
    };

    #logicalQuery;
    #logicalQueryJson;

    #originAliases = [];
    #originSchemas = new Map;

    #parentWindow;
    #subwindowConstraints = {
        selectMapping: [],
        filters: [],
        offset: 0,
    };
    #inheritanceDepth = 0;

    #localRecords = new Map;
    #firstRun = false;

    get driver() { return this.#driver; }

    get analysis() { return this.#analysis; }
    get strategy() { return this.#strategy; }
    get subwindowingRules() { return this.#subwindowingRules; }

    get status() { return this.#status; }

    get parentWindow() { return this.#parentWindow; }
    get inheritanceDepth() { return this.#inheritanceDepth; }

    constructor(driver, query, options = {}) {
        super();

        this.#driver = driver;
        if (!(query instanceof registry.BasicSelectStmt)) {
            throw new Error('Only SELECT statements are supported in live mode');
        }
        if (!Array.isArray(query.originSchemas())) {
            throw new Error('Expected a pre-resolved query object with originSchemas() returning an array');
        }
        this.#query = query;
        this.#queryJson = this.#query.jsonfy({ resultSchemas: false, originSchemas: false });
        this.#options = options;

        const self = this;
        this.#exprEngine = new ExprEngine(
            async function* (derivedQuery, compositeRow, queryCtx) {
                const stmt = derivedQuery.expr();
                if (!(stmt instanceof registry.SelectStmt)) {
                    throw new Error(`Unexpected expression: ${stmt}`);
                }
                const row = Object.create(null);
                for (const selectItem of stmt.selectList()) {
                    const { alias, value } = await self.#exprEngine.evaluate(selectItem, {}, queryCtx);
                    row[alias] = value;
                }
                yield row;
            },
            this.#options
        );

        // ------------------ analysis & strategy

        const analysis = this.constructor.analyseQuery(query);
        this.#analysis = analysis;
        const strategy = this.#strategy;

        if (analysis.hasAggrFunctions || analysis.hasGroupByClause) {
            // Can't be computed client-side due to windowing
            strategy.ssr = true; // SELECT: { ssr[, key[, ord]] }
            // Result records not mappable via keys to database records
            strategy.requeryMode = 'wholistic';
            if (this.#options.forceDiffing) {
                strategy.diffing = 'deep'; // key + content
            } else {
                strategy.diffing = false; // no diffing
            }
        }

        if (analysis.hasWindowFunctions) {
            // Can't be computed client-side due to windowing
            strategy.ssr = true; // SELECT: { ssr[, key[, ord]] }
            if (strategy.requeryMode === 'selective') {
                // Wrapped; to happen only after windowing
                strategy.requeryWrappedSelectivity = true;
            }
            if (strategy.diffing !== false) {
                // if not already disabled by aggr functions
                strategy.diffing = 'deep'; // key + content
            }
        }

        if (analysis.hasSubqueryExprsInSelect
            || analysis.hasSubqueryExprsInOrderBy) {
            // Can't be computed client-side
            strategy.ssr = true; // SELECT: { ssr[, key[, ord]] }
            if (strategy.diffing !== false
                && analysis.hasSubqueryExprsInSelect) {
                // if not already disabled by aggr functions
                strategy.diffing = 'deep'; // key + content
            }
        }

        if (analysis.hasOffsetClause
            || (analysis.hasLimitClause && analysis.hasOrderByClause)) {
            // Can't be computed client-side due to windowing
            if (strategy.requeryMode === 'selective') {
                // Wrapped; to happen only after windowing
                strategy.requeryWrappedSelectivity = true;
            }
        }

        // ------------------ subwindowingRules

        if (strategy.ssr) {
            // RESULT shape doesn't support client-side computing of projection & WHERE & ORDER BY
            // so these must match
            this.#subwindowingRules.projection = '=';
            this.#subwindowingRules.whereClause = '=';
            this.#subwindowingRules.ordinality = '=';
        } else {
            // RESULT shape supports client-side computing of projection & ORDER BY
            // but subqueries in WHERE can't be computed client-side, so, WHERE must match
            if (analysis.hasSubqueryExprsInWhere) {
                this.#subwindowingRules.whereClause = '=';
            }
        }

        if (analysis.hasOffsetClause
            || (analysis.hasLimitClause && analysis.hasOrderByClause)) {
            // Has OFFSET/LIMIT + ORDER BY (windowing):
            // so everything must match including WHERE & ORDER BY (expressions + directions) due to windowing
            this.#subwindowingRules.whereClause = '=';
            this.#subwindowingRules.ordinality = '=';
            this.#subwindowingRules.orderDirections = '=';
            // - OFFSET/LIMIT may differ in subwindow but must fall within current window range
            // - projection may differ in subwindow
        }
    }

    async inherit(parentWindow) {
        await this.stop(); // abort any ongoing
        this.#parentWindow = parentWindow;
        
        // Reset inheritance
        if (parentWindow === null) {
            this.#subwindowConstraints = {
                selectMapping: [],
                filters: [],
                offset: 0,
            };
            this.#inheritanceDepth = 0;
            return;
        }
        if (!(parentWindow instanceof QueryWindow)) {
            throw new Error(`Parent window must be instance of QueryWindow or null`);
        }
        // Process intersection
        if (!_eq(this.#subwindowingRules, parentWindow.#subwindowingRules)) return false;
        const result = this.constructor.intersectQueries(parentWindow.#query, this.#query, this.#subwindowingRules);
        if (result === false) return false;

        // Ready...
        this.#subwindowConstraints = result;
        this.#inheritanceDepth = parentWindow.inheritanceDepth + 1;
    }

    // -------------

    async start() {
        await this.stop();
        if (this.#parentWindow) {
            await this.#initializeAsSub();
        } else await this.#initializeAsRoot();
        this.#status = 1;
    }

    async stop() {
        this.#abortLine?.();
        this.#abortLine = null;
        this.#status = 0;
    }

    // -------------

    async #initializeAsRoot() {
        const analysis = this.#analysis;
        const strategy = this.#strategy;

        // Construct FromItem schemas
        // off analysis.fromItemsByAlias & query.originSchemas()
        const getJson = (node) => {
            const value = node.value();
            const delim = node._get('delim');
            return { value: delim ? value : value.toLowerCase(), delim };
        };
        for (const [alias, relationHashes] of Object.entries(analysis.fromItemsByAlias)) {
            const originSchema = this.#query.originSchemas().find((os) => {
                if (os instanceof registry.JSONSchema) return alias === '';
                return os.identifiesAs(alias);
            });
            let $columns,
                $keyColumns,
                usingAllColumnsForKeyColumns = false;
            if (originSchema instanceof registry.JSONSchema) {
                $columns = originSchema.entries().map((e) => getJson(e.name()));
                if (relationHashes.size > 1 || !($keyColumns = originSchema.entries().filter((e) => e.pkConstraint()).map(getJson)).length) {
                    $keyColumns = structuredClone($columns);
                    usingAllColumnsForKeyColumns = true;
                }
            } else {
                $columns = originSchema.columns().map((e) => getJson(e.name()));
                if (relationHashes.size > 1 || !($keyColumns = originSchema.pkConstraint(true)?.columns().map(getJson))) {
                    $keyColumns = structuredClone($columns);
                    usingAllColumnsForKeyColumns = true;
                }
            }
            const relation = relationHashes.size === 1
                ? (([schema, name]) => ({ schema, name }))(JSON.parse([...relationHashes][0]))
                : null;
            this.#originSchemas.set(alias, {
                relation,
                relationHashes: relationHashes,
                columns: $columns.map((c) => c.value),
                keyColumns: $keyColumns.map((c) => c.value),
                usingAllColumnsForKeyColumns,
                $columns,
                $keyColumns,
            });
            const delim = alias !== alias.toLowerCase()
                || /^\d/.test(alias)
                || !/^(\*|[\w]+)$/.test(alias);
            this.#originAliases.push({ value: alias, delim });
        }

        // ----------- newQueryHead

        // Generate a new head for the query
        // This is for internal computation
        let newQueryHead = this.#originAliases.reduce((acc, aliasJson) => {
            const originSchema = this.#originSchemas.get(aliasJson.value);

            // Column key/value construction
            const createColKeyValJson = (colJson) => {
                const keyJson = { nodeName: 'STRING_LITERAL', ...colJson };
                let colRefJson = { nodeName: 'COLUMN_REF1', ...colJson, qualifier: { nodeName: 'TABLE_REF1', ...aliasJson } };
                // Format for strategy.aggrMode === 2?
                if (analysis.hasAggrFunctions) {
                    const fnName = this.#driver.dialect === 'mysql' ? 'JSON_STRINGAGG' : 'JSON_AGG';
                    colRefJson = { nodeName: 'CALL_EXPR', name: fnName, arguments: [colRefJson] };
                }
                return [keyJson, colRefJson];
            };
            // Compose the cols JSON
            const fnName = this.#driver.dialect === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT';
            const fnArgs = (strategy.ssr ? originSchema.$keyColumns : originSchema.$columns)
                .reduce((colKeyValJsons, colJson) => ([...colKeyValJsons, ...createColKeyValJson(colJson)]), []);
            const aliasColsExpr = { nodeName: 'CALL_EXPR', name: fnName, arguments: fnArgs };

            // Format for strategy.ssr?
            // SELECT: { ssr: {...}, key: {...}[, ord] }
            if (strategy.ssr) {
                const aliasKeyJson = { nodeName: 'STRING_LITERAL', ...aliasJson };
                return acc.concat(aliasKeyJson, aliasColsExpr);
            }

            // Format for nornal select list
            // SELECT: { t1: {...}, t2: {...}, }
            const aliasKeyJson = { nodeName: 'SELECT_ITEM_ALIAS', ...aliasJson };
            return acc.concat({
                nodeName: 'SELECT_ITEM',
                alias: aliasKeyJson,
                expr: aliasColsExpr,
            });
        }, []);

        // Format for strategy.ssr?
        // SELECT: { ssr: {...}, key: {...}[, ord] }
        if (strategy.ssr) {
            // 1. Whole original query head as a select item
            const originalsArgs = this.#queryJson.select_list.reduce((acc, si) => {
                return acc.concat({ ...si.alias, nodeName: 'STRING_LITERAL' }, si.expr);
            }, []);
            const originalsJson = { nodeName: 'CALL_EXPR', name: fnName, arguments: originalsArgs };
            // 2. All keys as a select item
            const fnName = this.#driver.dialect === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT';
            const keysJson = { nodeName: 'CALL_EXPR', name: fnName, arguments: newQueryHead };
            // Final newQueryHead
            newQueryHead = [{ nodeName: 'SELECT_ITEM', alias: { nodeName: 'SELECT_ITEM_ALIAS', value: 'ssr' }, expr: originalsJson }];
            if (strategy.diffing) {
                newQueryHead.push({ nodeName: 'SELECT_ITEM', alias: { nodeName: 'SELECT_ITEM_ALIAS', value: 'key' }, expr: keysJson });
                // Oh ... with ordinality?
                if (analysis.hasOrderByClause) {
                    const fnName = this.#driver.dialect === 'mysql' ? 'JSON_ARRAY' : 'JSON_BUILD_ARRAY';
                    const ordsJson = { nodeName: 'CALL_EXPR', name: fnName, entries: this.#queryJson.order_by_clause.entries.map((oi) => oi.expr) };
                    newQueryHead.push({ nodeName: 'SELECT_ITEM', alias: { nodeName: 'SELECT_ITEM_ALIAS', value: 'ord' }, expr: ordsJson });
                }
            }
        }

        // Declare this.#logicalQueryJson
        // SELECT: { t1: {...}[, t2: {...}[, ...]] }
        this.#logicalQueryJson = { ...this.#queryJson, select_list: { entries: newQueryHead } };
        this.#logicalQuery = this.#query.constructor.fromJSON(this.#logicalQueryJson, { dialect: this.#driver.dialect });

        // ----------- connect

        // Connect to WAL events or equivalent
        // Drivers must implement the interface
        this.#abortLine = this.#driver.subscribe(analysis.fromItemsBySchema, (events) => {
            this.#handleEvents(events).catch((e) => this.emit('error', e));
        });
    }

    async #initializeAsSub() {
        // Handle "rawresult"
        const abortLine1 = this.#parentWindow.on('rawresult', async (resultRecords) => {
            resultRecords = await this.#applySubwindowConstraints(resultRecords);
            await this.#commitResult(resultRecords, true);
        });

        // Handle "rawdiff"
        const abortLine2 = this.#parentWindow.on('rawdiff', async (diffEvents) => {
            const _diffEvents = new Set;

            for (let diffEvent of diffEvents) {
                if (diffEvent.type === 'delete') {
                    // Ignore if not in this window
                    if (!this.#localRecords.has(diffEvent.oldHash)) continue;
                } else {
                    const passesWhere = await this.#applySubwindowWheres(diffEvent.logicalRecord);
                    if (this.#localRecords.has(diffEvent.oldHash)) {
                        diffEvent = !passesWhere
                            ? { ...diffEvent, type: 'delete' } // drop
                            : { ...diffEvent }; // keep
                    } else if (passesWhere) {
                        // Cast to insert; even if update
                        diffEvent = { ...diffEvent, type: 'insert' };
                    }
                }
                _diffEvents.add(diffEvent);
            }
            await this.#commitDiffs(_diffEvents);
        });

        // Set abortLine
        this.#abortLine = () => {
            abortLine1();
            abortLine2();
        };
    }

    // -------------

    async #applySubwindowConstraints(resultRecords) {
        const analysis = this.#analysis;
        const strategy = this.#strategy;

        let resultEntries = [];
        for (const [logicalHash, logicalRecord] of resultRecords.entries()) {
            if (await this.#applySubwindowWheres(logicalRecord)) {
                resultEntries.push([logicalHash, logicalRecord]);
            }
        }
        if (strategy.diffing && analysis.hasOrderByClause && (
            this.#subwindowingRules.ordinality === '~' || this.#subwindowingRules.orderDirections === '~')) {
            resultEntries = await this.#applySorting(resultEntries);
        }
        if (analysis.hasOffsetClause || analysis.hasLimitClause) {
            const effectiveLimit = await this.#exprEngine.evaluate(this.#query.limitClause().expr(), {}, this.#queryCtx);
            resultEntries = resultEntries.slice(this.#subwindowConstraints.offset, effectiveLimit);
        }
        return new Map(resultEntries);
    }

    async #applySubwindowWheres(logicalRecord) {
        for (const expr of this.#subwindowConstraints.filters) {
            const _eval = await this.#exprEngine.evaluate(expr, logicalRecord, this.#queryCtx);
            if (!_eval) return false;
        }
        return true;
    }

    // -------------

    async currentRendering() {
        const resultRecords = await this.currentRecords();
        const rows = [], hashes = [];
        for (const [logicalHash, logicalRecord] of resultRecords.entries()) {
            const row = await this.#renderLogicalRecord(logicalRecord);
            rows.push(row);
            hashes.push(logicalHash);
        }
        return { rows, hashes };
    }

    async currentRecords() {
        if (!this.#firstRun) {
            let resultRecords;
            if (this.#parentWindow) {
                resultRecords = await this.#parentWindow.currentRecords();
                resultRecords = await this.#applySubwindowConstraints(resultRecords);
            } else {
                resultRecords = await this.#queryHeadless();
            }
            await this.#commitResult(resultRecords);
            this.#firstRun = true;
        }
        return this.#localRecords;
    }

    async #queryHeadless(extraWhere = null) {
        const strategy = this.#strategy;
        let logicalQuery = this.#logicalQuery;

        if (extraWhere && strategy.requeryWrappedSelectivity) {
            const deriveSelectItem = (si) => ({ ...si, expr: { ...si.expr, qualifier: undefined } });
            const logicalQueryJson = {
                nodeName: 'BASIC_SELECT_STMT',
                select_list: { entries: this.#logicalQueryJson.select_list.entries.map(deriveSelectItem) },
                from_clause: { entries: [{ nodeName: 'FROM_ITEM', expr: { nodeName: 'DERIVED_QUERY', expr: this.#logicalQueryJson } }] },
                where_clause: { expr: extraWhere },
            };
            logicalQuery = this.#query.constructor.fromJSON(logicalQueryJson, { dialect: this.#driver.dialect });
        } else if (extraWhere) {
            let logicalQueryJson = this.#logicalQueryJson;
            const finalWhereJson = logicalQueryJson.where_clause?.expr
                ? { nodeName: 'BINARY_EXPR', left: extraWhere, operator: 'AND', right: logicalQueryJson.where_clause.expr }
                : extraWhere;
            logicalQueryJson = {
                ...logicalQueryJson,
                where_clause: { nodeName: 'WHERE_CLAUSE', expr: finalWhereJson },
            };
            logicalQuery = this.#query.constructor.fromJSON(logicalQueryJson, { dialect: this.#driver.dialect });
        }

        const result = await this.#driver.query(logicalQuery);

        const resultMap = new Map;
        for (const [i, logicalRecord] of result.rows.entries()) {
            const logicalHash = strategy.diffing
                ? this.#deriveLogicalHash(logicalRecord)
                : i;
            resultMap.set(logicalHash, logicalRecord);
        }

        return resultMap;
    }

    // -------------

    #getKeyValue(logicalRecord, alias, k) {
        return this.#strategy.ssr
            ? logicalRecord.key[alias][k]
            : logicalRecord[alias][k];
    }

    #deriveLogicalHash(logicalRecord) {
        const newKeysList = [...this.#originSchemas.entries()].map(([alias, originSchema]) => {
            const _newKeys = originSchema.keyColumns.map((k) => this.#getKeyValue(logicalRecord, alias, k));
            if (_newKeys.every((s) => s === null)) {
                return null; // IMPORTANT
            }
            return _newKeys;
        });
        return this.#stringifyLogicalHash(newKeysList);
    }

    #stringifyLogicalHash(keyValues) {
        return JSON.stringify(keyValues);
    }

    #parseLogicalHash(logicalHash) {
        return JSON.parse(logicalHash);
    }

    #localSet(logicalHash, logicalRecord) {
        this.#localRecords.set(logicalHash, logicalRecord);
    }

    #localDelete(logicalHash) {
        this.#localRecords.delete(logicalHash);
    }

    #localReindex(idChanges) {
        this.#localRecords = new Map([...this.#localRecords.entries()].map(([id, logicalRecord]) => {
            if (idChanges.has(id)) id = idChanges.get(id);
            return [id, logicalRecord];
        }));
    }

    async #renderLogicalRecord(logicalRecord) {
        const row = Object.create(null);

        if (this.#strategy.ssr) {
            if (!this.#subwindowConstraints.filters.length) return logicalRecord.ssr;
            const renderedValues = Object.values(logicalRecord.ssr);
            for (const [i, si] of this.#query.selectList().entries().entries()) {
                const value = renderedValues[i];
                const alias = si.alias()?.value() || '?column?';
                row[alias] = value;
            }
            return row;
        }

        for (const selectItem of this.#query.selectList()) {
            const { alias, value } = await this.#exprEngine.evaluate(selectItem, logicalRecord, this.#queryCtx);
            row[alias] = value;
        }
        return row;
    }

    // -------------

    #normalizeEvents(events) {
        const normalizedEventsMap = new Map;
        const keyHistoryMap = new Map;
        const allAffectedAliases = new Set;

        for (const e of events) {
            if (!(e.type === 'insert' || e.type === 'update' || e.type === 'delete')) continue;
            const relationHash = JSON.stringify([e.relation.schema, e.relation.name]);

            const affectedAliasesEntries = [...this.#originSchemas.entries()].filter(([, originSchema]) => originSchema.relationHashes.has(relationHash));

            if (!affectedAliasesEntries.length
                || affectedAliasesEntries.find(([, originSchema]) => originSchema.relationHashes.size > 1)) {
                return true;
            }

            const affectedAliases = affectedAliasesEntries.map(([alias]) => alias);
            for (const alias of affectedAliases) allAffectedAliases.add(alias);

            const keyColumns = e.relation.keyColumns;
            const oldKeys = e.key
                ? Object.values(e.key)
                : keyColumns.map((k) => e.new[k]);
            const newKeys = e.new
                ? keyColumns.map((k) => e.new[k])
                : oldKeys.slice(0);

            const normalizedEvent = { ...e, keyColumns, oldKeys, newKeys, relationHash, affectedAliases };

            let rowKeyHash_old = this.#stringifyLogicalHash([e.relation.schema, e.relation.name, normalizedEvent.oldKeys]);
            let rowKeyHash_new, previous;

            if ((previous = normalizedEventsMap.get(rowKeyHash_old))
                // Or if previous type was an update with key change... we see if rowKeyHash_old === previos' rowKeyHash_new
                || keyHistoryMap.has(rowKeyHash_old) && (previous = normalizedEventsMap.get(rowKeyHash_old = keyHistoryMap.get(rowKeyHash_old)))) {
                if (previous.type === 'insert' && normalizedEvent.type === 'delete') {
                    // Ignore; inconsequential
                    continue;
                }
                if (previous.type === 'delete' && normalizedEvent.type === 'insert') {
                    // Treat as update should in case props were changed before reinsertion
                    const _normalizedEvent = { ...normalizedEvent, type: 'update', old: previous.old };
                    normalizedEventsMap.set(rowKeyHash_old, _normalizedEvent);
                    continue;
                }
                if (previous.type === 'insert' && normalizedEvent.type === 'update') {
                    // Use the lastest state of said record for the insert
                    const _normalizedEvent = { ...normalizedEvent, oldKeys: previous.oldKeys, old: null, type: 'insert' };
                    normalizedEventsMap.delete(rowKeyHash_old); // Don't retain old slot; must come first
                    normalizedEventsMap.set(rowKeyHash_old, _normalizedEvent);
                    // Handle key changes
                    if ((rowKeyHash_new = this.#stringifyLogicalHash([e.relation.schema, e.relation.name, normalizedEvent.newKeys])) !== rowKeyHash_old) {
                        keyHistoryMap.set(rowKeyHash_new, rowKeyHash_old);
                    }
                    continue;
                }
                if (previous.type === 'update' && normalizedEvent.type === 'update') {
                    // Honour latest update, but mapped to old identity
                    const _normalizedEvent = { ...normalizedEvent, oldKeys: previous.oldKeys, old: previous.old };
                    normalizedEventsMap.delete(rowKeyHash_old); // Don't retain old slot; must come first
                    normalizedEventsMap.set(rowKeyHash_old, _normalizedEvent);
                    // Handle key changes
                    if ((rowKeyHash_new = this.#stringifyLogicalHash([e.relation.schema, e.relation.name, normalizedEvent.newKeys])) !== rowKeyHash_old) {
                        keyHistoryMap.set(rowKeyHash_new, rowKeyHash_old);
                    }
                    continue;
                }
                if (previous.type === 'update' && normalizedEvent.type === 'delete') {
                    // Honour latest event using same ID
                    normalizedEventsMap.delete(rowKeyHash_old); // Don't retain old slot
                    normalizedEventsMap.set(rowKeyHash_old, normalizedEvent);
                    continue;
                }
            } else {
                if (normalizedEvent.type === 'update') {
                    // Handle key changes
                    if ((rowKeyHash_new = this.#stringifyLogicalHash([e.relation.schema, e.relation.name, normalizedEvent.newKeys])) !== rowKeyHash_old) {
                        keyHistoryMap.set(rowKeyHash_new, rowKeyHash_old);
                    }
                }
                normalizedEventsMap.set(rowKeyHash_old, normalizedEvent);
            }
        }

        return [normalizedEventsMap, keyHistoryMap, allAffectedAliases];
    }

    async #handleEvents(events) {
        const analysis = this.#analysis;
        const strategy = this.#strategy;
        if (strategy.requeryMode === 'wholistic') {
            // Aggr functions in the house
            return await this.#diffWithOrigin_Wholistic();
        }
        const normalizeEvents = this.#normalizeEvents(events);
        if (normalizeEvents === true) {
            return await this.#diffWithOrigin_Wholistic();
        }
        if (analysis.isSingleTable) {
            const [normalizedEventsMap] = normalizeEvents;
            return await this.#diffWithLocal(normalizedEventsMap);
        }
        const [normalizedEventsMap, keyHistoryMap, allAffectedAliases] = normalizeEvents;
        return await this.#diffWithOrigin_Selective(normalizedEventsMap, keyHistoryMap, allAffectedAliases);
    }

    async #diffWithLocal(normalizedEventsMap) {
        const diffEvents = new Set;

        for (const normalizedEvent of normalizedEventsMap.values()) {

            if (normalizedEvent.type === 'insert') {
                const newHash = this.#stringifyLogicalHash([normalizedEvent.newKeys]);
                const logicalRecord = { [normalizedEvent.affectedAliases[0]]: normalizedEvent.new };
                const passesWhere = !this.#query.whereClause()
                    || await this.#exprEngine.evaluate(this.#query.whereClause().expr(), logicalRecord, this.#queryCtx);
                if (!passesWhere) continue;
                const diffEvent = { type: 'insert', newHash, logicalRecord };
                diffEvents.add(diffEvent);
            }

            if (normalizedEvent.type === 'update') {
                const oldHash = this.#stringifyLogicalHash([normalizedEvent.oldKeys]);
                const newHash = this.#stringifyLogicalHash([normalizedEvent.newKeys]);
                const logicalRecord = { [normalizedEvent.affectedAliases[0]]: normalizedEvent.new };
                let diffEvent;
                const passesWhere = !this.#query.whereClause()
                    || await this.#exprEngine.evaluate(this.#query.whereClause().expr(), logicalRecord, this.#queryCtx);
                if (this.#localRecords.has(oldHash)) {
                    diffEvent = !passesWhere
                        ? { type: 'delete', oldHash }
                        : { type: 'update', oldHash, newHash, logicalRecord };
                } else if (passesWhere) {
                    diffEvent = { type: 'insert', newHash, logicalRecord };
                }
                if (diffEvent) diffEvents.add(diffEvent);
            }

            if (normalizedEvent.type === 'delete') {
                const oldHash = this.#stringifyLogicalHash([normalizedEvent.oldKeys]);
                if (this.#localRecords.has(oldHash)) {
                    const diffEvent = { type: 'delete', oldHash, logicalRecord: this.#localRecords.get(oldHash) };
                    diffEvents.add(diffEvent);
                }
            }
        }

        return await this.#commitDiffs(diffEvents);
    }

    async #diffWithOrigin_Selective(normalizedEventsMap, keyHistoryMap, allAffectedAliases) {
        const strategy = this.#strategy;

        const composeSelectionLogic = (alias, keyColumns, keyValues, nullTest = 0) => {
            if (keyColumns.length > 1) {
                const operands = keyColumns.map((keyColumn, i) => composeSelectionLogic(alias, [keyColumn], [keyValues[i]], nullTest));
                return operands.reduce((left, right) => registry.BinaryExpr.fromJSON({
                    nodeName: 'BINARY_EXPR',
                    left,
                    operator: 'AND',
                    right,
                }), operands.shift());
            }
            // Compose...
            const columnRef = strategy.requeryWrappedSelectivity
                // key -> alias -> keyColumn
                ? { nodeName: 'BINARY_EXPR', left: { nodeName: 'COLUMN_REF1', value: 'key' }, operator: '->', right: { nodeName: 'BINARY_EXPR', left: { nodeName: 'COLUMN_REF1', value: alias }, operator: '->>', right: { nodeName: 'COLUMN_REF1', value: keyColumns[0] } } }
                // alias.keyColumn
                : { nodeName: 'COLUMN_REF1', value: keyColumns[0], qualifier: { nodeName: 'TABLE_REF1', value: alias } };
            // Compose: <keyColumn> IS NULL
            const nullLiteral = { nodeName: 'NULL_LITERAL', value: 'NULL' };
            const isNullExpr = registry.BinaryExpr.fromJSON({
                nodeName: 'BINARY_EXPR',
                left: columnRef,
                operator: 'IS',
                right: nullLiteral,
            });
            if (nullTest === 0) {
                return isNullExpr;
            }
            // Compose: <keyColumn> = <keyValue>
            const valueLiteral = { nodeName: typeof keyValues[0] === 'number' ? 'NUMBER_LITERAL' : 'STRING_LITERAL', value: keyValues[0] };
            const eqExpr = registry.BinaryExpr.fromJSON({
                nodeName: 'BINARY_EXPR',
                left: columnRef,
                operator: '=',
                right: valueLiteral
            });
            // Compose?: (<keyColumn> IS NULL OR <keyColumn> = <keyValue>)
            if (nullTest === 2) {
                const orExpr = {
                    nodeName: 'BINARY_EXPR',
                    left: isNullExpr,
                    operator: 'OR',
                    right: eqExpr,
                };
                return registry.RowConstructor.fromJSON({ nodeName: 'ROW_CONSTRUCTOR', entries: [orExpr] });
            }
            return eqExpr;
        };

        // ----------------

        const localRecords = new Map;
        const remoteDiffingFilters = [];

        for (const normalizedEvent of normalizedEventsMap.values()) {
            let diffingFilters = [];
            const affectedAliases = normalizedEvent.affectedAliases;
            if (normalizedEvent.type === 'insert') {
                // keyColumn === null // keyColumn IN [null, newKey]
                diffingFilters = [
                    affectedAliases.map((alias) => composeSelectionLogic(alias, normalizedEvent.keyColumns, normalizedEvent.oldKeys, 0)),
                    affectedAliases.map((alias) => composeSelectionLogic(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 2/* IMPORTANT */)),
                ];
            }
            if (normalizedEvent.type === 'update') {
                // keyColumn IN [null, oldKey] // keyColumn IN [null, newKey]
                diffingFilters = [
                    affectedAliases.map((alias) => composeSelectionLogic(alias, normalizedEvent.keyColumns, normalizedEvent.oldKeys, 2)),
                    affectedAliases.map((alias) => composeSelectionLogic(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 2)),
                ];
            }
            if (normalizedEvent.type === 'delete') {
                // keyColumn IN [null, oldKey] // keyColumn === null
                diffingFilters = [
                    affectedAliases.map((alias) => composeSelectionLogic(alias, normalizedEvent.keyColumns, normalizedEvent.oldKeys, 2/* IMPORTANT */)),
                    affectedAliases.map((alias) => composeSelectionLogic(alias, normalizedEvent.keyColumns, normalizedEvent.newKeys, 0)),
                ];
            }
            top: for (const [logicalHash, logicalRecord] of this.#localRecords.entries()) {
                for (const expr of diffingFilters[0]) {
                    if (!await this.#exprEngine.evaluate(expr, logicalRecord, this.#queryCtx)) {
                        continue top;
                    }
                }
                // All of diffingFilters[0] matched - AND
                localRecords.set(logicalHash, logicalRecord);
            }
            // Build this event's diffingFilters
            const diffingFilters_currentEvent = diffingFilters[1].reduce((left, right) => {
                return registry.BinaryExpr.fromJSON({ nodeName: 'BINARY_EXPR', left, operator: 'AND', right });
            }, diffingFilters[1].shift());
            remoteDiffingFilters.push(diffingFilters_currentEvent);
        }

        let diffingFilters_allEvents = remoteDiffingFilters[0];
        if (remoteDiffingFilters.length > 1) {
            // Compose the logic
            const _diffingFilters_allEvents = remoteDiffingFilters.reduce((left, right) => {
                return registry.BinaryExpr.fromJSON({ nodeName: 'BINARY_EXPR', left, operator: 'OR', right });
            }, remoteDiffingFilters.shift());
            // Wrap the logic?
            if (!strategy.requeryWrappedSelectivity) {
                diffingFilters_allEvents = registry.RowConstructor.fromJSON({
                    nodeName: 'ROW_CONSTRUCTOR',
                    entries: [_diffingFilters_allEvents],
                });
            } else diffingFilters_allEvents = _diffingFilters_allEvents;
        }

        // ----------------

        const resolveTransition = (oldHash, matches) => {
            const oldHash_parsed = this.#parseLogicalHash(oldHash);
            let i;
            for (const [alias, originSchema] of this.#originSchemas.entries()) {
                if (allAffectedAliases.has(alias)) {
                    const relation = originSchema.relation;
                    // An event happen of this alias?
                    let possibleEventId;
                    let normalizedEvent;
                    if (oldHash_parsed[i] === null) {
                        // Find INSERTS or UPDATES that might slot in here from the right hand side
                        matches = matches.filter(([k]) => {
                            // Find an INSERT or UPDATE that might talk about this object
                            if (k[i] !== null && (possibleEventId = JSON.parse([relation.schema, relation.name, k[i]])) && (
                                (normalizedEvent = normalizedEventsMap.get(possibleEventId))
                                || keyHistoryMap.has(possibleEventId) && (normalizedEvent = normalizedEventsMap.get(possibleEventId = keyHistoryMap.get(possibleEventId)))
                            )) return true; // At least an INSERT or UPDATE is found on oldHash_parsed[i]
                        });
                    } else {
                        // Find a DELETE or UPDATE that might talk about this object
                        if ((possibleEventId = JSON.parse([relation.schema, relation.name, oldHash_parsed[i]]))
                            && (normalizedEvent = normalizedEventsMap.get(possibleEventId))) {
                            matches = matches.filter(([k]) => {
                                // Remote hash would be null on normalizedEvent.type === 'delete'
                                return normalizedEvent.type === 'delete' ? k[i] === null : _eq(normalizedEvent.newKeys, k[i]);
                            });
                        }
                    }
                }
                // Default matcher: exact key values at given slot
                matches = matches.filter(([k]) => _eq(oldHash_parsed[i], k[i]));
                i++;
            }
            if (!matches.length) return [];
            return [this.#stringifyLogicalHash(matches[0][0]), matches[0][1]];
        };

        // ----------------

        const remoteRecords = await this.#queryHeadless(diffingFilters_allEvents);
        return await this.#createDiffs(localRecords, remoteRecords, resolveTransition);
    }

    async #diffWithOrigin_Wholistic() {
        const remoteRecords = await this.#queryHeadless();
        return !this.#strategy.diffing
            ? await this.#commitResult(remoteRecords, true)
            : await this.#createDiffs(this.#localRecords, remoteRecords);
    }

    async #createDiffs(localRecords, remoteRecords, resolveTransition = null) {
        const diffEvents = new Set;

        const parseRemoteRecords = () => [...remoteRecords.entries()].map(([k, v]) => [this.#parseLogicalHash(k), v]);
        let remoteRecords_parsed = parseRemoteRecords();

        for (const [logicalHash_existing, logicalRecord_existing] of localRecords.entries()) {
            if (remoteRecords.has(logicalHash_existing)) {
                const logicalRecord_new = remoteRecords.get(logicalHash_existing);
                remoteRecords.delete(logicalHash_existing);
                remoteRecords_parsed = parseRemoteRecords(); // refresh
                const diffEvent = { type: 'update', oldHash: logicalHash_existing, newHash: logicalHash_existing, logicalRecord: logicalRecord_new };
                diffEvents.add(diffEvent);
                continue;
            }
            if (resolveTransition) {
                const [logicalHash_new, logicalRecord_new] = resolveTransition(logicalHash_existing, remoteRecords_parsed);
                if (logicalHash_new) {
                    remoteRecords.delete(logicalHash_new);
                    remoteRecords_parsed = parseRemoteRecords(); // refresh
                    const diffEvent = { type: 'update', oldHash: logicalHash_existing, newHash: logicalRecord_new, logicalRecord: logicalRecord_new };
                    diffEvents.add(diffEvent);
                    continue;
                }
            }
            const diffEvent = { type: 'delete', oldHash: logicalHash_existing, logicalRecord: logicalRecord_existing };
            diffEvents.add(diffEvent);
        }

        for (const [logicalHash_new, logicalRecord_new] of remoteRecords.entries()) {
            const diffEvent = { type: 'insert', newHash: logicalHash_new, logicalRecord: logicalRecord_new };
            diffEvents.add(diffEvent);
        }

        return await this.#commitDiffs(diffEvents);
    }

    async #commitDiffs(diffEvents) {
        if (!diffEvents?.size) return false;
        const analysis = this.#analysis;

        const _diffEvents = new Set;
        const deferredInserts = new Set;
        const idChanges = new Map;
        const outputEvents = new Set;

        const effectiveLimit = analysis.hasLimitClause
            ? await this.#exprEngine.evaluate(this.#query.limitClause().expr(), {}, this.#queryCtx)
            : 0;
        const render = async (diffEvent) => {
            const row = await this.#renderLogicalRecord(diffEvent.logicalRecord);
            const outputEvent = {
                type: diffEvent.type,
                ...(diffEvent.type === 'update' ? { oldHash: diffEvent.oldHash, old: diffEvent.old } : {}),
                newHash: diffEvent.newHash,
                new: row,
            };
            return outputEvent;
        };

        for (const diffEvent of diffEvents) {
            if (diffEvent.type === 'delete') {
                const outputEvent = {
                    type: diffEvent.type,
                    oldHash: diffEvent.oldHash,
                    old: diffEvent.old,
                }
                this.#localDelete(diffEvent.oldHash);
                _diffEvents.add(diffEvent);
                outputEvents.add(outputEvent);
                continue;
            }
            if (diffEvent.type === 'update'
                && diffEvent.newHash !== diffEvent.oldHash) {
                idChanges.set(diffEvent.oldHash, diffEvent.newHash);
            } else if (diffEvent.type === 'insert'
                && effectiveLimit
                && this.#localRecords.size === effectiveLimit) {
                deferredInserts.add(diffEvent);
                continue;
            }
            this.#localSet(diffEvent.oldHash, diffEvent.logicalRecord);
            _diffEvents.add(diffEvent);
            outputEvents.add(await render(diffEvent));
        }

        // Re-attempt INSERTs
        for (const diffEvent of deferredInserts) {
            if (this.#localRecords.size === effectiveLimit) break;
            this.#localSet(diffEvent.newHash, diffEvent.logicalRecord);
            _diffEvents.add(diffEvent);
            outputEvents.add(await render(diffEvent));
        }

        if (idChanges.size) this.#localReindex(idChanges);
        if (_diffEvents.size) this.emit('rawdiff', _diffEvents);
        if (outputEvents.size) this.emit('diff', [...outputEvents]);

        if (analysis.hasOrderByClause) {
            const reorderedLocalRecords = await this.#applySorting(this.#localRecords, true);
            await this.#commitResult(reorderedLocalRecords);
        }

        return true;
    }

    async #commitResult(resultRecords, emit = false) {
        this.#localRecords.clear();
        for (const [logicalHash, logicalRecord] of resultRecords.entries()) {
            this.#localSet(logicalHash, logicalRecord);
        }
        if (emit) {
            this.emit('rawresult', new Map(this.#localRecords));
            this.emit('result', await this.currentRendering());
        }
    }

    async #applySorting(logicalRecords, emit = false) {
        const entries = !Array.isArray(logicalRecords)
            ? [...logicalRecords.entries()]
            : logicalRecords;

        const orderElements = this.#query.orderByClause().entries();
        let decorated;
        if (this.#strategy.ssr) {
            decorated = decorated.map((entry) => ({ entry, keys: entry[1].ord }));
        } else {
            decorated = await Promise.all(entries.map(async (entry) => {
                const keys = await Promise.all(orderElements.map(orderElement =>
                    this.#exprEngine.evaluate(orderElement.expr(), entry[1], this.#queryCtx)
                ));
                return { entry, keys };
            }));
        }
        this.#exprEngine.applySorting(decorated, orderElements, this.#queryCtx);
        const _entries = decorated.map((e) => e.entry);

        if (emit) {
            const origianlLogicalKeys = entries/* original */.map((e) => e[0]);
            const reorderedLocalKeys = _entries.map((e) => e[0]);
            const keyRemap = [];
            for (const [oldIdx, logicalHash] of origianlLogicalKeys.entries()) {
                const newIdx = reorderedLocalKeys.indexOf(logicalHash);
                if (newIdx !== oldIdx) keyRemap.push([logicalHash, origianlLogicalKeys[newIdx]]);
            }
            if (keyRemap.length) {
                this.emit('swap', keyRemap);
            }
        }

        if (!Array.isArray(logicalRecords)) return new Map(_entries);
        return _entries;
    }
}
