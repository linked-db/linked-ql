import { normalizeQueryArgs } from './util.js';
import { AbstractClient } from './AbstractClient.js';
import { AbstractNode } from '../../lang/abstracts/AbstractNode.js';
import { AbstractStmt } from '../../lang/abstracts/AbstractStmt.js';
import { RealtimeClient } from '../../proc/realtime/RealtimeClient.js';
import { Transformer } from '../../lang/Transformer.js';
import { registry } from '../../lang/registry.js';
import { Result } from '../../entry/Result.js';

export class AbstractSQLClient extends AbstractClient {

    get dialect() { throw new Error('Not implemented'); }

    #realtimeClient;

    get realtimeClient() { return this.#realtimeClient; }

    constructor({ capability = {} } = {}) {
        super({ capability });
        this.#realtimeClient = new RealtimeClient(this);
    }

    async parse(querySpec, { alias = null, dynamicWhereMode = false, ...options } = {}) {
        if (!querySpec) return;

        const wrapORLogic = (exprJson) => {
            if ((exprJson.nodeName === registry.BinaryExpr.NODE_NAME && exprJson.operator === 'OR')
                || (exprJson instanceof registry.BinaryExpr && exprJson.operator() === 'OR')) {
                return { nodeName: registry.RowConstructor.NODE_NAME, entries: [exprJson] };
            }
            return exprJson;
        }

        // 1. ----------- SQL string

        if (typeof querySpec === 'string' || typeof querySpec === 'object' && typeof querySpec.query === 'string') {
            let query = await registry.Script.parse(querySpec.query || querySpec, { dialect: options.dialect || this.dialect, supportStdStmt: true });
            if (query.length === 1) query = query.entries()[0];

            if (dynamicWhereMode) {
                let baseAlias;
                if (query instanceof registry.CompleteSelectStmt) {
                    if (alias) {
                        const baseFromItem = query.fromClause().entries()[0];
                        baseAlias = (baseFromItem.alias() || baseFromItem.expr())?.value();
                    }
                } else if (query instanceof registry.UpdateStmt || query instanceof registry.DeleteStmt) {
                    if (alias) {
                        const tableExpr = query.tableExpr();
                        baseAlias = (tableExpr.alias() || tableExpr.tableRef())?.value();
                    }
                } else {
                    throw new Error('Dynamic where mode is only supported for SELECT, UPDATE, or DELETE statements.');
                }

                let queryJson = query.jsonfy();
                const baseExpr = queryJson.where_clause?.expr;

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
                    queryJson = {
                        ...queryJson,
                        where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: dynamicWhere },
                    };
                    return registry.Script.fromJSON(
                        { entries: [queryJson] },
                        { dialect: options.dialect, assert: true, supportStdStmt: true }
                    ).entries()[0];
                };
            }

            return query;
        }

        // 2. ----------- Command

        const toExpr = (val) => {
            if (typeof val === 'number') {
                return { nodeName: registry.NumberLiteral.NODE_NAME, value: val };
            }
            return { nodeName: registry.StringLiteral.NODE_NAME, value: val + '' };
        };

        const tblName = querySpec.name;
        const namespaceName = querySpec.namespace;
        const tableRefJson = { nodeName: registry.TableRef1.NODE_NAME, value: tblName, qualifier: namespaceName && { nodeName: registry.NamespaceRef.NODE_NAME, value: namespaceName } };

        let queryJson;
        switch (querySpec.command || 'select') {

            case 'insert':
                const payload = [].concat(querySpec.payload);
                if (!(typeof payload[0] === 'object' && payload[0])) {
                    throw new Error('Invalid insert row format. Expected a non-null object.');
                }

                const columnNames = Object.keys(payload[0]);
                const columns = columnNames.map((colName) => ({ nodeName: registry.ColumnRef2.NODE_NAME, value: colName }));
                queryJson = {
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
                    queryJson.values_clause.entries.push(rowJson);
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

                queryJson = {
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
                    queryJson.set_clause.entries.push(assignmentJson);
                }

                break;

            case 'delete':
                queryJson = {
                    nodeName: registry.DeleteStmt.NODE_NAME,
                    table_expr: {
                        nodeName: registry.TableAbstraction2.NODE_NAME,
                        table_ref: tableRefJson,
                        alias: alias ? { nodeName: registry.SelectItemAlias.NODE_NAME, value: alias } : undefined
                    },
                };

                break;

            case 'select':
                const selectItems = (querySpec.columns || ['*']).map((colName) => {
                    return {
                        nodeName: registry.SelectItem.NODE_NAME,
                        expr: colName === '*'
                            ? { nodeName: registry.ColumnRef0.NODE_NAME, value: colName }
                            : { nodeName: registry.ColumnRef1.NODE_NAME, value: colName }
                    };
                });
                queryJson = {
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

            default: throw new Error(`Invalid query input`);
        }

        if (querySpec.command !== 'insert') {
            let baseExpr;

            if (typeof querySpec.filters === 'object' && querySpec.filters) {
                baseExpr = Object.keys(querySpec.filters).reduce((acc, key) => {
                    const left = { nodeName: registry.ColumnRef1.NODE_NAME, value: key };
                    const right = toExpr(querySpec.filters[key]);
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
                    queryJson = {
                        ...queryJson,
                        where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: dynamicWhere },
                    };
                    return registry.Script.fromJSON(
                        { entries: [queryJson] },
                        { dialect: options.dialect, assert: true, supportStdStmt: true }
                    ).entries()[0];
                };
            }

            if (baseExpr) {
                queryJson = {
                    ...queryJson,
                    where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: baseExpr },
                };
            }
        }

        return registry.Script.fromJSON(
            { entries: [queryJson] },
            { dialect: options.dialect, assert: true, supportStdStmt: true }
        ).entries()[0];
    }

    async resolve(query, options = {}) {
        // Parsing...
        if (!(query instanceof AbstractNode)) {
            query = await this.parse(query, options);
        } else if (!(query instanceof registry.Script)
            && !(query instanceof AbstractStmt)
            && !(query instanceof registry.MYSetStmt)
            && !(query instanceof registry.PGSetStmt)) {
            throw new TypeError('query must be a string or an instance of Script | AbstractStmt');
        }
        if (query instanceof registry.Script && query.length === 1) {
            query = query.entries()[0];
        }

        // Return if query is a set statement or a standard statement
        if (query instanceof registry.MYSetStmt
            || query instanceof registry.PGSetStmt
            || query instanceof registry.StdStmt
        ) return query;

        // Determine by heuristics if desugaring needed
        if ((query instanceof registry.DDLStmt && !query.returningClause?.()) // Desugaring not applicable
            || query.originSchemas?.()?.length // Desugaring already done
        ) return query;

        // Schema inference...
        const relationSelector = {};
        let anyFound = false;
        query.walkTree((v, k, scope) => {
            if (v instanceof registry.MYSetStmt
                || v instanceof registry.PGSetStmt
                || v instanceof registry.StdStmt
            ) return;
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
            const namespaceName = v.qualifier()?._get('delim')
                ? v.qualifier().value()
                : v.qualifier()?.value().toLowerCase() || '*';
            const tableName = v._get('delim')
                ? v.value()
                : v.value().toLowerCase();
            if (namespaceName === '*' && scope.has(tableName)) return;
            if (!(namespaceName in relationSelector)) {
                relationSelector[namespaceName] = [];
            }
            if (!relationSelector[namespaceName].includes(tableName)) {
                relationSelector[namespaceName].push(tableName);
                anyFound = true;
            }
        }, true);

        if (anyFound) await this.schemaInference.provide(relationSelector);

        // DeSugaring...
        return query.deSugar(true, {}, null, this.schemaInference);
    }

    async query(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.resolve(_query, options);
        // Realtime query?
        if (options.live && query.fromClause?.()) {
            return await this.#realtimeClient.query(query, options);
        }
        const result = await this._query(query, options);
        return new Result({ rows: result.rows, rowCount: result.rowCount });
    }

    async cursor(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.resolve(_query, options);
        return await this._cursor(query, options);
    }

    async showCreate(selector, structured = false) {
        return await this._showCreate(selector, structured);
    }
}