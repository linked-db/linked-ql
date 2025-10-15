import { AbstractNodeList } from './abstracts/AbstractNodeList.js';
import { registry } from './registry.js';

export class Script extends AbstractNodeList {

    /* SYNTAX RULES */

    static get _contentTypes() {
        return [
            'SelectStmt',
            'TableStmt',
            'InsertStmt',
            'UpsertStmt',
            'UpdateStmt',
            'DeleteStmt',
            'MYSetStmt',
            'CTE',
            'CreateSchemaStmt',
            'DropSchemaStmt',
            'CreateTableStmt',
            'DropTableStmt',
        ];
    }

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ';' };
        return { type: this._contentTypes, as: 'entries', arity: Infinity, itemSeparator, autoSpacing: '\n' };
    }

    /* API */

    static async parse(input, options = {}) {
        const tokenStream = await this.toStream(input, options);
        const result = await super.parse(tokenStream, options);
        if (!tokenStream.done && tokenStream.current()) {
            const current = tokenStream.current();
            const message = `[${this.NODE_NAME}] Unexpected ${current.type} token:${typeof current.value === 'string' ? ` "${current.value}"` : ''} at <line ${current.line}, column ${current.column}>`;
            throw new SyntaxError(message);
        }
        return result;
    }

    static async parseSpec(querySpec, options = {}) {
        if (querySpec.query) {
            const result = await this.parse(querySpec.query, options);
            if (result.length === 1) return result.entries()[0];
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

        const whereClauseJson = typeof querySpec.where === 'object' && querySpec.where
            ? {
                nodeName: registry.WhereClause.NODE_NAME,
                expr: Object.keys(querySpec.where).reduce((acc, key) => {
                    const left = { nodeName: registry.ColumnRef1.NODE_NAME, value: key };
                    const right = toExpr(querySpec.where[key]);
                    const exprJson = { nodeName: registry.BinaryExpr.NODE_NAME, left, operator: '=', right };
                    if (!acc) return exprJson;
                    return { nodeName: registry.BinaryExpr.NODE_NAME, left: acc, operator: 'AND', right: exprJson };
                }, null)
            }
            : undefined;

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
                    table_expr: { nodeName: registry.TableAbstraction2.NODE_NAME, table_ref: tableRefJson },
                    set_clause: { nodeName: registry.SetClause.NODE_NAME, entries: [] },
                    where_clause: whereClauseJson,
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
                    table_expr: { nodeName: registry.TableAbstraction2.NODE_NAME, table_ref: tableRefJson },
                    where_clause: whereClauseJson,
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
                    from_clause: { nodeName: registry.FromClause.NODE_NAME, entries: [{ nodeName: registry.FromItem.NODE_NAME, expr: tableRefJson }] },
                    where_clause: whereClauseJson,
                };

                break;
        }

        return this.fromJSON({ entries: [resultJson] }, { dialect: options.dialect, assert: true }).entries()[0];
    }

    stringify(options = {}) { return `${super.stringify(options)};`; }
}