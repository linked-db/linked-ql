import '../../lang/index.js';
import { normalizeQueryArgs, normalizeSchemaSelectorArg } from './util.js';
import { AbstractStmt } from '../../lang/abstracts/AbstractStmt.js';
import { SchemaInference } from '../../lang/SchemaInference.js';
import { RealtimeClient } from '../realtime/RealtimeClient.js';
import { Transformer } from '../../lang/Transformer.js';
import { SimpleEmitter } from './SimpleEmitter.js';
import { registry } from '../../lang/registry.js';
import { Result } from '../Result.js';

export class AbstractClient extends SimpleEmitter {

    get dialect() { throw new Error('Not implemented'); }

    #subscribers = new Map;

    #schemaInference;
    #realtimeClient;

    #capabilityOverride;
    #workingCapability;

    get schemaInference() { return this.#schemaInference; }
    get realtimeClient() { return this.#realtimeClient; }

    constructor({ capability = {} } = {}) {
        super();
        this.#capabilityOverride = capability;
        this.#workingCapability = capability;
        this.#schemaInference = new SchemaInference({ driver: this });
        this.#realtimeClient = new RealtimeClient(this);
    }

    async connect() {
        await this._connect();
    }

    async disconnect() {
        await this.setCapability({ realtime: false });
        await this._disconnect();
    }

    async query(...args) {
        const [query, options] = await this.resolveQuery(...args);
        // Realtime query?
        if (options.live && query.fromClause?.()) {
            return await this.#realtimeClient.query(query, options);
        }
        const result = await this._query(query, options);
        return new Result({ rows: result.rows, rowCount: result.rowCount });
    }

    async cursor(...args) {
        const [query, options] = await this.resolveQuery(...args);
        return await this._cursor(query, options);
    }

    async resolveQuery(...args) {
        let [query, options] = normalizeQueryArgs(...args);

        // Parsing...
        if (typeof query === 'string') {
            query = await registry.Script.parse(query, { dialect: options.dialect || this.dialect });
        } else if (typeof query === 'object' && query && (typeof query.query === 'string' || typeof query.command === 'string')) {
            query = await this.parseQuery(query, { dialect: options.dialect || this.dialect });
        } else if (!(query instanceof registry.Script) && !(query instanceof AbstractStmt)) {
            throw new TypeError('query must be a string or an instance of Script | AbstractStmt');
        }
        if (query instanceof registry.Script && query.length === 1) {
            query = query.entries()[0];
        }

        // Determine by heuristics if desugaring needed
        if ((query instanceof registry.DDLStmt && !query.returningClause?.()) // Desugaring not applicable
            || query.originSchemas?.()?.length // Desugaring already done
        ) return [query, options];

        // Schema inference...
        const schemaSelector = {};
        let anyFound = false;
        query.walkTree((v, k, scope) => {
            if (v instanceof registry.DDLStmt
                && !v.returningClause?.()) return;
            if (v instanceof registry.CTEItem) {
                const alias = v.alias()?._get('delim')
                    ? v.alias().value()
                    : v.alias()?.value().toLowerCase();
                scope.set(alias, true);
                return v;
            }
            if ((!(v instanceof registry.TableRef2) || v.parentNode instanceof registry.ColumnIdent)
                && (!(v instanceof registry.TableRef1) || v.parentNode instanceof registry.ColumnRef1)) {
                return v;
            }
            const schemaName = v.qualifier()?._get('delim')
                ? v.qualifier().value()
                : v.qualifier()?.value().toLowerCase() || '*';
            const tableName = v._get('delim')
                ? v.value()
                : v.value().toLowerCase();
            if (schemaName === '*' && scope.has(tableName)) return;
            if (!(schemaName in schemaSelector)) {
                schemaSelector[schemaName] = [];
            }
            if (!schemaSelector[schemaName].includes(tableName)) {
                schemaSelector[schemaName].push(tableName);
                anyFound = true;
            }
        }, true);

        if (anyFound) await this.#schemaInference.provide(schemaSelector);

        // DeSugaring...
        query = query.deSugar(true, {}, null, this.#schemaInference);
        return [query, options];
    }

    async parseQuery(querySpec, { alias = null, dynamicWhereMode = false, ...options } = {}) {

        const wrapORLogic = (exprJson) => {
            if ((exprJson.nodeName === registry.BinaryExpr.NODE_NAME && exprJson.operator === 'OR')
                || (exprJson instanceof registry.BinaryExpr && exprJson.operator() === 'OR')) {
                return { nodeName: registry.RowConstructor.NODE_NAME, entries: [exprJson] };
            }
            return exprJson;
        }

        if (querySpec.query) {
            let result = await registry.Script.parse(querySpec.query, options);
            if (result.length === 1) result = result.entries()[0];

            if (dynamicWhereMode) {
                let baseAlias;
                if (result instanceof registry.CompleteSelectStmt) {
                    if (alias) {
                        const baseFromItem = result.fromClause().entries()[0];
                        baseAlias = (baseFromItem.alias() || baseFromItem.expr())?.value();
                    }
                } else if (result instanceof registry.UpdateStmt || result instanceof registry.DeleteStmt) {
                    if (alias) {
                        const tableExpr = result.tableExpr();
                        baseAlias = (tableExpr.alias() || tableExpr.tableRef())?.value();
                    }
                } else {
                    throw new Error('Dynamic where mode is only supported for SELECT, UPDATE, or DELETE statements.');
                }

                let resultJson = result.jsonfy();
                const baseExpr = resultJson.where_clause?.expr;

                return (dynamicWhere) => {
                    // Rewrite column qualifiers to baseAlias?
                    if (dynamicWhere && alias && baseAlias && alias !== baseAlias) {
                        const transformer = new Transformer((node, defaultTransform) => {
                            if (node instanceof registry.ColumnRef1 && node.qualifier()?.identifiesAs(alias)) {
                                const bodyResultJson = defaultTransform();
                                return { ...bodyResultJson, qualifier: { ...bodyResultJson.qualifier, value: baseAlias } };
                            }
                            return defaultTransform();
                        }, null);
                        dynamicWhere = dynamicWhere.jsonfy({}, transformer);
                    }
                    // Dummy condition
                    if (!dynamicWhere || dynamicWhere === true) {
                        dynamicWhere = { nodeName: registry.BoolLiteral.NODE_NAME, value: 'TRUE' };
                    }
                    // Concat logic
                    if (baseExpr) {
                        dynamicWhere = { nodeName: registry.BinaryExpr.NODE_NAME, left: wrapORLogic(dynamicWhere), operator: 'AND', right: wrapORLogic(baseExpr) };
                    }
                    // Patch query
                    resultJson = {
                        ...resultJson,
                        where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: dynamicWhere },
                    };
                    return registry.Script.fromJSON(
                        { entries: [resultJson] },
                        { dialect: options.dialect, assert: true }
                    ).entries()[0];
                };
            }

            return result;
        }

        function toExpr(val) {
            if (typeof val === 'number') {
                return { nodeName: registry.NumberLiteral.NODE_NAME, value: val };
            }
            return { nodeName: registry.StringLiteral.NODE_NAME, value: val + '' };
        }

        const tblName = typeof querySpec.table === 'object' ? querySpec.table.name + '' : querySpec.table + '';
        const schemaName = typeof querySpec.table === 'object' ? querySpec.table.schema : undefined;
        const tableRefJson = { nodeName: registry.TableRef1.NODE_NAME, value: tblName, qualifier: schemaName && { nodeName: registry.SchemaRef.NODE_NAME, value: schemaName } };

        let resultJson;
        switch (querySpec.command) {

            case 'insert':
                const payload = [].concat(querySpec.payload);
                if (!(typeof payload[0] === 'object' && payload[0])) {
                    throw new Error('Invalid insert row format. Expected a non-null object.');
                }

                const columnNames = Object.keys(payload[0]);
                const columns = columnNames.map((colName) => ({ nodeName: registry.ColumnRef2.NODE_NAME, value: colName }));
                resultJson = {
                    nodeName: registry.InsertStmt.NODE_NAME,
                    table_ref: { ...tableRefJson, nodeName: registry.TableRef2.NODE_NAME },
                    pg_table_alias: alias ? { nodeName: registry.Identifier.NODE_NAME, value: alias } : undefined,
                    column_list: { nodeName: registry.ColumnsConstructor.NODE_NAME, entries: columns },
                    values_clause: { nodeName: registry.ValuesConstructor.NODE_NAME, entries: [] },
                };

                for (const row of payload) {
                    if (!(typeof row === 'object' && row)) {
                        throw new Error('Invalid insert row format. Expected a non-null object.');
                    }

                    const _columnNames = new Set(Object.keys(row));
                    if (_columnNames.size !== columnNames.length) {
                        throw new Error('Inconsistent column count across rows in insert payload');
                    }

                    const rowJson = { nodeName: registry.RowConstructor.NODE_NAME, entries: [] };
                    for (const colName of columnNames) {
                        if (!_columnNames.has(colName)) {
                            throw new Error(`Missing column "${colName}" in insert row`);
                        }
                        rowJson.entries.push(toExpr(row[colName]));
                    }
                    resultJson.values_clause.entries.push(rowJson);
                }

                break;

            case 'update':
                const _payload = querySpec.payload;

                if (Array.isArray(_payload)) {
                    throw new Error('Batch update is not supported. Please provide a single payload object for update.');
                }
                if (!(typeof _payload === 'object' && _payload)) {
                    throw new Error('Invalid update payload format. Expected a non-null object.');
                }

                resultJson = {
                    nodeName: registry.UpdateStmt.NODE_NAME,
                    table_expr: {
                        nodeName: registry.TableAbstraction2.NODE_NAME,
                        table_ref: tableRefJson,
                        alias: alias ? { nodeName: registry.SelectItemAlias.NODE_NAME, value: alias } : undefined
                    },
                    set_clause: { nodeName: registry.SetClause.NODE_NAME, entries: [] },
                };

                const _columnNames = Object.keys(_payload);
                for (const colName of _columnNames) {
                    const assignmentJson = {
                        nodeName: registry.AssignmentExpr.NODE_NAME,
                        left: options.dialect === 'mysql' ? { nodeName: registry.ColumnRef1.NODE_NAME, value: colName } : { nodeName: registry.ColumnRef2.NODE_NAME, value: colName },
                        operator: '=',
                        right: toExpr(_payload[colName])
                    };
                    resultJson.set_clause.entries.push(assignmentJson);
                }

                break;

            case 'delete':
                resultJson = {
                    nodeName: registry.DeleteStmt.NODE_NAME,
                    table_expr: {
                        nodeName: registry.TableAbstraction2.NODE_NAME,
                        table_ref: tableRefJson,
                        alias: alias ? { nodeName: registry.SelectItemAlias.NODE_NAME, value: alias } : undefined
                    },
                };

                break;

            case 'select':
                const selectItems = querySpec.columns.map((colName) => {
                    return {
                        nodeName: registry.SelectItem.NODE_NAME,
                        expr: colName === '*'
                            ? { nodeName: registry.ColumnRef0.NODE_NAME, value: colName }
                            : { nodeName: registry.ColumnRef1.NODE_NAME, value: colName }
                    };
                });
                resultJson = {
                    nodeName: registry.CompleteSelectStmt.NODE_NAME,
                    select_list: { nodeName: registry.SelectList.NODE_NAME, entries: selectItems },
                    from_clause: {
                        nodeName: registry.FromClause.NODE_NAME,
                        entries: [{
                            nodeName: registry.FromItem.NODE_NAME,
                            expr: tableRefJson,
                            alias: alias ? { nodeName: registry.FromItemAlias.NODE_NAME, value: alias } : undefined
                        }]
                    },
                };

                break;
        }

        if (querySpec.command !== 'insert') {
            let baseExpr;

            if (typeof querySpec.where === 'object' && querySpec.where) {
                baseExpr = Object.keys(querySpec.where).reduce((acc, key) => {
                    const left = { nodeName: registry.ColumnRef1.NODE_NAME, value: key };
                    const right = toExpr(querySpec.where[key]);
                    const exprJson = { nodeName: registry.BinaryExpr.NODE_NAME, left, operator: '=', right };
                    if (!acc) return exprJson;
                    return { nodeName: registry.BinaryExpr.NODE_NAME, left: acc, operator: 'AND', right: exprJson };
                }, null);
            }

            if (dynamicWhereMode) {
                return (dynamicWhere) => {
                    // Dummy condition
                    if (!dynamicWhere || dynamicWhere === true) {
                        dynamicWhere = { nodeName: registry.BoolLiteral.NODE_NAME, value: 'TRUE' };
                    }
                    // Concat logic
                    if (baseExpr) {
                        dynamicWhere = { nodeName: registry.BinaryExpr.NODE_NAME, left: wrapORLogic(dynamicWhere), operator: 'AND', right: baseExpr };
                    }
                    // Patch query
                    resultJson = {
                        ...resultJson,
                        where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: dynamicWhere },
                    };
                    return registry.Script.fromJSON(
                        { entries: [resultJson] },
                        { dialect: options.dialect, assert: true }
                    ).entries()[0];
                };
            }

            if (baseExpr) {
                resultJson = {
                    ...resultJson,
                    where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: baseExpr },
                };
            }
        }

        return registry.Script.fromJSON(
            { entries: [resultJson] },
            { dialect: options.dialect, assert: true }
        ).entries()[0];
    }

    async showCreate(selector, structured = false) {
        return await this._showCreate(selector, structured);
    }

    async subscribe(selector, callback) {
        await this.setCapability({ realtime: true });

        if (typeof selector === 'function') {
            callback = selector;
            selector = '*';
        }

        const flattenedSelectorSet = normalizeSchemaSelectorArg(selector, true);
        this.#subscribers.set(callback, flattenedSelectorSet);

        return async () => {
            this.#subscribers.delete(callback);
            if (!this.#subscribers.size) {
                await this.setCapability({ realtime: false });
            }
        };
    }

    async setCapability(capMap) {
        const _capMap = Object.fromEntries(Object.entries(capMap).filter(([k, v]) => {
            return !v || this.#capabilityOverride[k] !== false;
        }));
        // realtime?
        if (_capMap.realtime === false) {
            await this._teardownRealtime();
        } else if (_capMap.realtime) {
            await this._setupRealtime();
        }
        // Publish...
        this.#workingCapability = {
            ...this.#workingCapability,
            ..._capMap,
        };
    }

    // ---------

    _fanout(events) {
        const eventsAndPatterns = [];
        const allPatterns = new Set;
        for (const event of events) {
            const patterns = [
                JSON.stringify([event.relation.schema, event.relation.name]),
                JSON.stringify(['*', event.relation.name]),
                JSON.stringify([event.relation.schema, '*']),
            ];
            eventsAndPatterns.push({ event, patterns });
            allPatterns.add(patterns[0]);
            allPatterns.add(patterns[1]);
            allPatterns.add(patterns[2]);
        }
        for (const [cb, flattenedSelectorSet] of this.#subscribers.entries()) {
            let _events = [];
            // Match and filter
            for (const pattern of flattenedSelectorSet) {
                if (pattern === '["*","*"]') {
                    _events = [...events];
                    break;
                } else if (allPatterns.has(pattern)) {
                    for (const { event, patterns } of eventsAndPatterns) {
                        if (patterns.includes(pattern)) {
                            _events.push(event);
                        }
                    }
                    break;
                }
            }
            if (!_events.length) continue;
            // Successful match
            cb(_events);
        }
    }
}