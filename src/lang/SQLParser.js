import { AbstractNode } from './abstracts/AbstractNode.js';
import { Transformer } from './Transformer.js';
import { registry } from './registry.js';
import './index.js';

export class SQLParser {

    #dialect;
    get dialect() { return this.#dialect; }

    constructor({ dialect = null } = {}) {
        this.#dialect = dialect;
    }

    async parse(querySpec, { alias = null, ...options } = {}) {
        if (!querySpec) return;
        if (querySpec instanceof AbstractNode) return querySpec;
        if (typeof querySpec === 'object' && typeof querySpec.nodeName === 'string') {
            return registry.SQLScript.fromJSON(
                { entries: [querySpec] },
                { assert: true, dialect: options.dialect || this.#dialect, supportStdStmt: true }
            ).entries()[0];
        }

        // 1. --- SQL script
        if (typeof querySpec === 'string' || typeof querySpec === 'object' && querySpec.query) {
            return await this.parseSQL(querySpec, options);
        }

        // 2. --- JSON commands
        let queryJson;

        if ((querySpec.command || 'select') === 'select')
            queryJson = this.selectDef_to_selectAST(querySpec, options);

        else if (querySpec.command === 'insert')
            queryJson = this.insertDef_to_insertAST(querySpec, options);

        else if (querySpec.command === 'update')
            queryJson = this.updateDef_to_updateAST(querySpec, options);

        else if (querySpec.command === 'delete')
            queryJson = this.deleteDef_to_deleteAST(querySpec, options);

        else throw new Error(`Invalid query input`);

        if (querySpec.command !== 'insert')
            queryJson = await this.filtersDef_to_whereAST(querySpec, queryJson, options);

        return registry.SQLScript.fromJSON(
            { entries: [queryJson] },
            { assert: true, dialect: options.dialect || this.#dialect, supportStdStmt: true }
        ).entries()[0];
    }

    // ---------- SQL

    async parseSQL(querySpec, options = {}) {
        let query;

        if (typeof querySpec === 'string' || typeof querySpec.query === 'string') {
            query = await registry.SQLScript.parse(querySpec.query || querySpec, { dialect: options.dialect || this.#dialect, supportStdStmt: true });
        } else if (querySpec.query) {
            if (typeof querySpec.query.nodeName !== 'string')
                throw new SyntaxError(`querySpec.query must be either a string or a valid AST object`);
            query = registry.SQLScript.fromJSON(
                querySpec.query.nodeName === registry.SQLScript.NODE_NAME
                    ? querySpec.query
                    : { nodeName: registry.SQLScript.NODE_NAME, entries: [querySpec.query] },
                { dialect: options.dialect || this.#dialect, supportStdStmt: true }
            );
        } else throw new SyntaxError(`Invalid query input format`);

        if (query.length === 1) query = query.entries()[0];

        if (options.dynamicWhereMode) {
            let baseAlias;
            if (query instanceof registry.CompleteSelectStmt) {
                if (options.alias) {
                    const baseFromItem = query.fromClause().entries()[0];
                    baseAlias = (baseFromItem.alias() || baseFromItem.expr())?.value();
                }
            } else if (query instanceof registry.UpdateStmt || query instanceof registry.DeleteStmt) {
                if (options.alias) {
                    const tableExpr = query.tableExpr();
                    baseAlias = (tableExpr.alias() || tableExpr.tableRef())?.value();
                }
            } else {
                throw new Error('Dynamic where mode is only supported for SELECT, UPDATE, or DELETE statements.');
            }

            let queryJson = query.jsonfy();
            const baseExpr = queryJson.where_clause?.expr;

            const dynamicQueryCallback = (dynamicWhere) => {
                // Rewrite column qualifiers to baseAlias?
                if (dynamicWhere && options.alias && baseAlias && options.alias !== baseAlias) {
                    const transformer = new Transformer((node, defaultTransform) => {
                        if (node instanceof registry.ColumnRef1 && node.qualifier()?.identifiesAs(options.alias)) {
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
                    dynamicWhere = { nodeName: registry.BinaryExpr.NODE_NAME, left: this.#wrapORLogic(dynamicWhere), operator: 'AND', right: this.#wrapORLogic(baseExpr) };
                }
                // Patch query
                queryJson = {
                    ...queryJson,
                    where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: dynamicWhere },
                };
                return registry.SQLScript.fromJSON(
                    { entries: [queryJson] },
                    { dialect: options.dialect || this.#dialect, assert: true, supportStdStmt: true }
                ).entries()[0];
            };

            if (options.dynamicWhere) {
                return await dynamicQueryCallback(options.dynamicWhere);
            }

            return dynamicQueryCallback;
        }

        return query;
    }

    // ---------- Utils

    #wrapORLogic(exprJson) {
        if ((exprJson.nodeName === registry.BinaryExpr.NODE_NAME && exprJson.operator === 'OR')
            || (exprJson instanceof registry.BinaryExpr && exprJson.operator() === 'OR')) {
            return { nodeName: registry.RowConstructor.NODE_NAME, entries: [exprJson] };
        }
        return exprJson;
    }

    #getTableRefJson(querySpec) {
        const tblName = querySpec.name;
        const namespaceName = querySpec.namespace;
        const tableRefJson = { nodeName: registry.TableRef1.NODE_NAME, value: tblName, qualifier: namespaceName && { nodeName: registry.NamespaceRef.NODE_NAME, value: namespaceName } };
        return tableRefJson;
    }

    #toExpr(val) {
        if (typeof val === 'number') {
            return { nodeName: registry.NumberLiteral.NODE_NAME, value: val };
        }
        return { nodeName: registry.StringLiteral.NODE_NAME, value: val + '' };
    }

    // ---------- Commands

    selectDef_to_selectAST(querySpec, options = {}) {
        const tableRefJson = this.#getTableRefJson(querySpec);

        const selectItems = (querySpec.columns || ['*']).map((colName) => {
            return {
                nodeName: registry.SelectItem.NODE_NAME,
                expr: colName === '*'
                    ? { nodeName: registry.ColumnRef0.NODE_NAME, value: colName }
                    : { nodeName: registry.ColumnRef1.NODE_NAME, value: colName }
            };
        });

        const queryJson = {
            nodeName: registry.CompleteSelectStmt.NODE_NAME,
            select_list: { nodeName: registry.SelectList.NODE_NAME, entries: selectItems },
            from_clause: {
                nodeName: registry.FromClause.NODE_NAME,
                entries: [{
                    nodeName: registry.FromItem.NODE_NAME,
                    expr: tableRefJson,
                    alias: options.alias ? { nodeName: registry.FromItemAlias.NODE_NAME, value: options.alias } : undefined
                }]
            },
        };

        return queryJson;
    }

    insertDef_to_insertAST(querySpec, options = {}) {
        const tableRefJson = this.#getTableRefJson(querySpec);

        const payload = [].concat(querySpec.payload);
        if (!(typeof payload[0] === 'object' && payload[0])) {
            throw new Error('Invalid insert row format. Expected a non-null object.');
        }

        const columnNames = Object.keys(payload[0]);
        const columns = columnNames.map((colName) => ({ nodeName: registry.ColumnRef2.NODE_NAME, value: colName }));

        const queryJson = {
            nodeName: registry.InsertStmt.NODE_NAME,
            table_ref: { ...tableRefJson, nodeName: registry.TableRef2.NODE_NAME },
            pg_table_alias: options.alias ? { nodeName: registry.Identifier.NODE_NAME, value: options.alias } : undefined,
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
                rowJson.entries.push(this.#toExpr(row[colName]));
            }
            queryJson.values_clause.entries.push(rowJson);
        }

        return queryJson;
    }

    updateDef_to_updateAST(querySpec, options = {}) {
        const tableRefJson = this.#getTableRefJson(querySpec);
        const _payload = querySpec.payload;

        if (Array.isArray(_payload)) {
            throw new Error('Batch update is not supported. Please provide a single payload object for update.');
        }
        if (!(typeof _payload === 'object' && _payload)) {
            throw new Error('Invalid update payload format. Expected a non-null object.');
        }

        const queryJson = {
            nodeName: registry.UpdateStmt.NODE_NAME,
            table_expr: {
                nodeName: registry.TableAbstraction2.NODE_NAME,
                table_ref: tableRefJson,
                alias: options.alias ? { nodeName: registry.SelectItemAlias.NODE_NAME, value: options.alias } : undefined
            },
            set_clause: { nodeName: registry.SetClause.NODE_NAME, entries: [] },
        };

        const _columnNames = Object.keys(_payload);
        for (const colName of _columnNames) {
            const assignmentJson = {
                nodeName: registry.AssignmentExpr.NODE_NAME,
                left: options.dialect === 'mysql' ? { nodeName: registry.ColumnRef1.NODE_NAME, value: colName } : { nodeName: registry.ColumnRef2.NODE_NAME, value: colName },
                operator: '=',
                right: this.#toExpr(_payload[colName])
            };
            queryJson.set_clause.entries.push(assignmentJson);
        }

        return queryJson;
    }

    deleteDef_to_deleteAST(querySpec, options = {}) {
        const tableRefJson = this.#getTableRefJson(querySpec);

        const queryJson = {
            nodeName: registry.DeleteStmt.NODE_NAME,
            table_expr: {
                nodeName: registry.TableAbstraction2.NODE_NAME,
                table_ref: tableRefJson,
                alias: options.alias ? { nodeName: registry.SelectItemAlias.NODE_NAME, value: options.alias } : undefined
            },
        };

        return queryJson;
    }

    // ---------- Where

    filtersDef_to_whereAST(querySpec, queryJson, options) {
        let baseExpr;

        if (typeof querySpec.filters === 'object' && querySpec.filters) {
            baseExpr = Object.keys(querySpec.filters).reduce((acc, key) => {
                const left = { nodeName: registry.ColumnRef1.NODE_NAME, value: key };
                const right = this.#toExpr(querySpec.filters[key]);
                const exprJson = { nodeName: registry.BinaryExpr.NODE_NAME, left, operator: '=', right };
                if (!acc) return exprJson;
                return { nodeName: registry.BinaryExpr.NODE_NAME, left: acc, operator: 'AND', right: exprJson };
            }, null);
        }

        if (options.dynamicWhereMode) {
            const dynamicQueryCallback = (dynamicWhere) => {
                // Dummy condition
                if (!dynamicWhere || dynamicWhere === true) {
                    dynamicWhere = { nodeName: registry.BoolLiteral.NODE_NAME, value: 'TRUE' };
                }
                // Concat logic
                if (baseExpr) {
                    dynamicWhere = { nodeName: registry.BinaryExpr.NODE_NAME, left: this.#wrapORLogic(dynamicWhere), operator: 'AND', right: baseExpr };
                }
                // Patch query
                queryJson = {
                    ...queryJson,
                    where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: dynamicWhere },
                };
                return registry.SQLScript.fromJSON(
                    { entries: [queryJson] },
                    { dialect: options.dialect || this.#dialect, assert: true, supportStdStmt: true }
                ).entries()[0];
            };

            if (options.dynamicWhere) {
                return dynamicQueryCallback(options.dynamicWhere);
            }

            return dynamicQueryCallback;
        }

        if (baseExpr) {
            queryJson = {
                ...queryJson,
                where_clause: { nodeName: registry.WhereClause.NODE_NAME, expr: baseExpr },
            };
        }

        return queryJson;
    }

    // ------------ DDL

    async tableDef_to_tableAST(tblDef, options = {}) {
        // ----- 1. Base
        const tableSchemaJson = {
            nodeName: registry.TableSchema.NODE_NAME,
            name: {
                nodeName: registry.TableIdent.NODE_NAME,
                qualifier: (tblDef.namespace || tblDef.namespace_id) && { nodeName: registry.NamespaceRef.NODE_NAME, value: tblDef.namespace || tblDef.namespace_id.name },
                value: tblDef.name,
            },
            entries: [],
        };

        if (tblDef.columns && !Array.isArray(tblDef.columns) && !(tblDef.columns instanceof Map))
            throw new Error(`Column list must be an array or a map`);

        if (tblDef.constraints && !Array.isArray(tblDef.constraints) && !(tblDef.constraints instanceof Map))
            throw new Error(`Constraint list must be an array or a map`);

        // ----- 2. Columns
        const cols = tblDef.columns?.values() || [];

        for (const _col of cols) {
            const col = await this.resolve_columnDef(_col, (col, prop) => {
                if (prop === 'type_id') {
                    if (typeof col.type_id !== 'object')
                        throw new Error(`[${col.name}] The system "type_id" property must be an object`);
                    col.type = col.type_id.name;
                }
            }, options);

            // Base
            const colJson = {
                nodeName: registry.ColumnSchema.NODE_NAME,
                name: { nodeName: registry.Identifier.NODE_NAME, value: col.name },
                data_type: { nodeName: registry.DataType.NODE_NAME, value: col.type },
                entries: [],
            };

            // ColumnNullConstraint
            if (col.not_null) {
                colJson.entries.push({
                    nodeName: registry.ColumnNullConstraint.NODE_NAME,
                    value: 'NOT',
                });
            }

            // ColumnExpressionConstraint
            if (col.generation_expr_ast) {
                colJson.entries.push({
                    nodeName: registry.ColumnExpressionConstraint.NODE_NAME,
                    expr: col.generation_expr_ast,
                    stored: 'STORED',
                });
            } else if (col.is_generated) {
                // ColumnIdentityConstraint
                colJson.entries.push({
                    nodeName: registry.ColumnIdentityConstraint.NODE_NAME,
                    always_kw: col.generation_rule === 'always' || undefined,
                    by_default_kw: col.generation_rule === 'by_default' || undefined,
                    as_identity_kw: true,
                });
            }

            // ColumnDefaultConstraint
            if (col.default_expr_ast) {
                colJson.entries.push({
                    nodeName: registry.ColumnDefaultConstraint.NODE_NAME,
                    expr: col.default_expr_ast,
                });
            }

            tableSchemaJson.entries.push(colJson);
        }

        // ----- 3. Constraints
        const cons = tblDef.constraints instanceof Map
            ? [...tblDef.constraints.values()].reduce((acc, cons) => acc.concat(cons), [])
            : (tblDef.constraints.values() || []);

        for (const _con of cons) {
            const con = await this.resolve_constraintDef(_con, (con, prop) => {
                const conDisplayName = con.name || 'CONSTRAINT';

                if (prop === 'columns') {
                    if (!con.columns.every((x) => typeof x === 'string'))
                        throw new Error(`[${conDisplayName}] The "columns" property must be a list of strings`);
                } else if (prop === 'column_ids') {
                    if (!con.column_ids.every((x) => x && typeof x === 'object'))
                        throw new Error(`[${conDisplayName}] The system "column_ids" property must be a list of objects`);
                    con.columns = con.column_ids.map((c) => c.name);
                }

                if (prop === 'target_namespace') {
                    if (con.target_namespace) return;
                    con.target_namespace = tblDef.namespace || tblDef.namespace_id?.name;
                } else if (prop === 'fk_target_namespace_id') {
                    if (typeof con.fk_target_namespace_id !== 'object')
                        throw new Error(`[${conDisplayName}] The system "fk_target_namespace_id" property must be an object`);
                    con.target_namespace = con.fk_target_namespace_id.name;
                }

                if (prop === 'target_relation') {
                    if (con.target_relation) return;
                    con.target_relation = tblDef.name;
                } else if (prop === 'fk_target_relation_id') {
                    if (typeof con.fk_target_relation_id !== 'object')
                        throw new Error(`[${conDisplayName}] The system "fk_target_relation_id" property must be an object`);
                    con.target_relation = con.fk_target_relation_id.name;
                }

                if (prop === 'target_columns') {
                    if (!con.target_columns.every((x) => typeof x === 'string'))
                        throw new Error(`[${conDisplayName}] The "target_columns" property must be a list of strings`);
                } else if (prop === 'fk_target_column_ids') {
                    if (!con.fk_target_column_ids.every((x) => x && typeof x === 'object'))
                        throw new Error(`[${conDisplayName}] The system "fk_target_column_ids" property must be a list of objects`);
                    con.target_columns = con.fk_target_column_ids.map((c) => c.name);
                }
            }, options);

            // TablePKConstraint
            if (con.kind === 'PRIMARY KEY') {
                tableSchemaJson.entries.push({
                    nodeName: registry.TablePKConstraint.NODE_NAME,
                    columns: con.columns.map((c) => ({
                        nodeName: registry.ColumnRef2.NODE_NAME,
                        value: c
                    })),
                    value: 'KEY',
                });
            }

            // TableFKConstraint
            if (con.kind === 'FOREIGN KEY') {
                const conDef = {
                    nodeName: registry.TableFKConstraint.NODE_NAME,
                    columns: con.columns.map((c) => ({
                        nodeName: registry.ColumnRef2.NODE_NAME,
                        value: c
                    })),
                    target_table: {
                        nodeName: registry.TableRef2.NODE_NAME,
                        qualifier: { nodeName: registry.NamespaceRef.NODE_NAME, value: con.target_namespace },
                        value: con.target_relation,
                    },
                    target_columns: con.target_columns.map((c) => ({
                        nodeName: registry.Identifier.NODE_NAME,
                        value: c
                    })),
                    referential_rules: [],
                };

                if (con.match_rule !== 'NONE') {
                    conDef.referential_rules.push({
                        nodeName: registry.FKMatchRule.NODE_NAME,
                        value: con.match_rule,
                    });
                }
                if (con.update_rule) {
                    conDef.referential_rules.push({
                        nodeName: registry.FKUpdateRule.NODE_NAME,
                        action: await registry.ReferentialAction.parse(con.update_rule, { dialect: options.dialect || this.#dialect }),
                    });
                }
                if (con.delete_rule) {
                    conDef.referential_rules.push({
                        nodeName: registry.FKDeleteRule.NODE_NAME,
                        action: await registry.ReferentialAction.parse(con.delete_rule, { dialect: options.dialect || this.#dialect }),
                    });
                }

                tableSchemaJson.entries.push(conDef);
            }

            // TableUKConstraint
            if (con.kind === 'UNIQUE') {
                tableSchemaJson.entries.push({
                    nodeName: registry.TableUKConstraint.NODE_NAME,
                    columns: con.columns.map((c) => ({
                        nodeName: registry.ColumnRef2.NODE_NAME,
                        value: c
                    }))
                });
            }

            // CheckConstraint
            if (con.kind === 'CHECK') {
                tableSchemaJson.entries.push({
                    nodeName: registry.CheckConstraint.NODE_NAME,
                    expr: con.ck_expression_ast
                });
            }
        }

        // ----- 4. Result schema
        return registry.TableSchema.fromJSON(
            tableSchemaJson,
            { assert: true, dialect: options.dialect || this.#dialect || undefined }
        );
    }

    // ------------ Resolvers

    async resolve_columnDef({ ...col }, resolve, options = {}) {
        // --- Name
        if (typeof col.name !== 'string')
            throw new Error(`[COLUMN] Column name must be a string`);
        if (!/^\w/.test(col.name))
            throw new Error(`[${col.name}] Column name must start with a letter or underscore`);

        // --- Type
        if (col.type) {
            if (typeof col.type !== 'string')
                throw new Error(`[${col.name}] Column type must be a string`);
            if (col.type_id) throw new Error(`[${col.name}] Only one of "type" or "type_id" may be specified for a column`);
            await resolve(col, 'type');
        } else if (col.type_id) {
            await resolve(col, 'type_id');
        }

        if (!col.type_id && !col.type) throw new Error(`[${col.name}] Column type must be specified`);

        // --- Generation
        if (![undefined, null].includes(col.generation_expr)) {
            if (!col.is_generated)
                throw new Error(`[${col.name}] Cannot specify "generation_expr" on a non-generated column`);
            if (!['string', 'number'].includes(typeof col.generation_expr))
                throw new Error(`[${col.name}] The "generation_expr" property must be a string or number`);
            if (col.generation_expr_ast) throw new Error(`[${col.name}] Only one of "generation_expr" or "generation_expr_ast" may be specified for a column`);
            col.generation_expr_ast = (await registry.Expr.parse(col.generation_expr + '', { dialect: options.dialect || this.#dialect })).jsonfy();
        } else if (col.generation_expr_ast) {
            if (!col.is_generated)
                throw new Error(`[${col.name}] Cannot specify "generation_expr_ast" on a non-generated column`);
            if (typeof col.generation_expr_ast.nodeName !== 'string')
                throw new Error(`[${col.name}] The system "generation_expr_ast" property must be a valid AST`);
        }

        if (col.generation_expr_ast) {
            if (col.generation_rule && col.generation_rule !== 'always')
                throw new Error(`[${col.name}] Unsupported rule ${col.generation_rule} for generated columns`);
            col.generation_rule = 'always';
        } else if (col.is_generated) {
            if (col.generation_rule && !['always', 'by_default'].includes(col.generation_rule))
                throw new Error(`[${col.name}] Unsupported rule ${col.generation_rule} for identity columns`);
            col.generation_rule = col.generation_rule || 'by_default';
        }

        // --- Default
        if (![undefined, null].includes(col.default_expr)) {
            if (!['string', 'number'].includes(typeof col.default_expr))
                throw new Error(`[${col.name}] The "default_expr" property must be a string or number`);
            if (col.default_expr_ast) throw new Error(`[${col.name}] Only one of "default_expr" or "default_expr_ast" may be specified for a column`);

            col.default_expr_ast = (await registry.Expr.parse(col.default_expr + '', { dialect: options.dialect || this.#dialect })).jsonfy();
        } else if (col.default_expr_ast) {
            if (typeof col.default_expr_ast.nodeName !== 'string')
                throw new Error(`[${col.name}] The system "default_expr_ast" property must be a valid AST`);
        }

        return col;
    }

    async resolve_constraintDef({ ...con }, resolve, options = {}) {
        const conDisplayName = con.name || 'CONSTRAINT';

        // --- Name
        if (con.name) {
            if (typeof con.name !== 'string')
                throw new Error(`[CONSTRAINT] Constraint name must be a string`);
            if (!/^\w/.test(con.name))
                throw new Error(`[CONSTRAINT] Constraint name must start with a letter or underscore`);
        }

        // --- Kind
        if (!['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK'].includes(con.kind))
            throw new Error(`[${conDisplayName}] Unknown constraint kind: ${con.kind}`);

        // --- Columns
        if (con.columns?.length) {
            if (con.kind === 'CHECK')
                throw new Error(`[${conDisplayName}] Cannot specify "columns" on a check constraint`);
            if (!Array.isArray(con.columns) || !con.columns.length)
                throw new Error(`[${conDisplayName}] The "columns" property must be an array, non-empty, when provided`);
            if (con.column_ids)
                throw new Error(`[${conDisplayName}] Only one of "columns" or "column_ids" may be specified for a constraint`);

            await resolve(con, 'columns');
        } else if (con.column_ids?.length) {
            if (con.kind === 'CHECK')
                throw new Error(`[${conDisplayName}] Cannot specify "column_ids" on a check constraint`);
            if (!Array.isArray(con.column_ids) || !con.column_ids.length)
                throw new Error(`[${conDisplayName}] The system "column_ids" property must be an array, non-empty, when provided`);

            await resolve(con, 'column_ids');
        }

        if (!con.columns?.length && !con.column_ids?.length && con.kind !== 'CHECK')
            throw new Error(`[${conDisplayName}] columns must be specified`);

        // --- Expression
        if (![undefined, null].includes(con.expression)) {
            if (con.kind !== 'CHECK')
                throw new Error(`[${conDisplayName}] Cannot specify "expression" on a non-check constraint`);
            if (!['string', 'number'].includes(typeof con.expression))
                throw new Error(`[${conDisplayName}] The "expression" property must be a string`);
            if (con.ck_expression_ast) throw new Error(`[${conDisplayName}] Only one of "expression" or "ck_expression_ast" may be specified for a constraint`);

            con.ck_expression_ast = (await registry.Expr.parse(con.expression + '', { dialect: options.dialect || this.#dialect })).jsonfy();
        } else if (con.ck_expression_ast) {
            if (con.kind !== 'CHECK')
                throw new Error(`[${conDisplayName}] Cannot specify "ck_expression_ast" on a non-check constraint`);
            if (typeof con.ck_expression_ast.nodeName !== 'string')
                throw new Error(`[${conDisplayName}] The system "ck_expression_ast" property must be a valid AST`);
        }

        if (!con.expression && !con.ck_expression_ast && con.kind === 'CHECK')
            throw new Error(`[${conDisplayName}] Cannot create a check constraint without an expression`);

        // --- TargetNamespace
        if (con.target_namespace) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "target_namespace" on a non-foreign key constraint`);
            if (con.fk_target_namespace_id)
                throw new Error(`[${conDisplayName}] Only one of "target_namespace" or "fk_target_namespace_id" may be specified for a constraint`);
            if (typeof con.target_namespace !== 'string')
                throw new Error(`[${conDisplayName}] The "target_namespace" property must be a string`);
            if (con.fk_target_namespace_id)
                throw new Error(`[${conDisplayName}] Only one of "target_namespace" or "fk_target_namespace_id" may be specified for a constraint`);

            await resolve(con, 'target_namespace');
        } else if (con.fk_target_namespace_id) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "fk_target_namespace_id" on a non-foreign key constraint`);

            await resolve(con, 'fk_target_namespace_id');
        }

        // --- TargetRelation
        if (con.target_relation) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "target_relation" on a non-foreign key constraint`);
            if (typeof con.target_relation !== 'string')
                throw new Error(`[${conDisplayName}] The "target_relation" property must be a string`);
            if (con.fk_target_relation_id)
                throw new Error(`[${conDisplayName}] Only one of "target_relation" or "fk_target_relation_id" may be specified for a constraint`);

            await resolve(con, 'target_relation');
        } else if (con.fk_target_relation_id) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "fk_target_relation_id" on a non-foreign key constraint`);

            await resolve(con, 'fk_target_relation_id');
        }

        if (!con.target_relation && !con.fk_target_relation_id && con.kind === 'FOREIGN KEY')
            throw new Error(`[${conDisplayName}] Cannot create a foreign key constraint without a target relation`);

        // --- TargetColumns
        if (con.target_columns) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "target_columns" on a non-foreign key constraint`);
            if (!Array.isArray(con.target_columns) || !con.target_columns.length)
                throw new Error(`[${conDisplayName}] The "target_columns" property must be an array, non-empty, when provided`);
            if (con.fk_target_column_ids)
                throw new Error(`[${conDisplayName}] Only one of "target_columns" or "fk_target_column_ids" may be specified for a constraint`);

            await resolve(con, 'target_columns');
        } else if (con.fk_target_column_ids) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "fk_target_column_ids" on a non-foreign key constraint`);
            if (!Array.isArray(con.fk_target_column_ids))
                throw new Error(`[${conDisplayName}] The system "fk_target_column_ids" property must be an array, non-empty, when provided`);

            await resolve(con, 'fk_target_column_ids');
        }

        if (!con.target_column?.length && !con.fk_target_column_ids?.length && con.kind === 'FOREIGN KEY')
            throw new Error(`[${conDisplayName}] Cannot create a foreign key constraint without target columns`);

        // --- Match rule
        if (con.match_rule || con.fk_match_rule) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "match_rule" or "fk_match_rule" on a non-foreign key constraint`);
            if (con.match_rule && con.fk_match_rule)
                throw new Error(`[${conDisplayName}] Only one of "match_rule" or "fk_match_rule" may be specified for a constraint`);

            con.fk_match_rule = con.match_rule || con.fk_match_rule;

            if (!['FULL', 'PARTIAL', 'NONE'].includes(con.fk_match_rule))
                throw new Error(`[${conDisplayName}] Unknown match rule: ${con.fk_match_rule}`);
        } else if (con.kind === 'FOREIGN KEY') {
            con.fk_match_rule = 'FULL';
        }

        // --- Update rule
        if (con.update_rule || con.fk_update_rule) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "update_rule" or "fk_update_rule" on a non-foreign key constraint`);
            if (con.update_rule && con.fk_update_rule)
                throw new Error(`[${conDisplayName}] Only one of "update_rule" or "fk_update_rule" may be specified for a constraint`);

            con.fk_update_rule = con.update_rule || con.fk_update_rule;

            if (!['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'].includes(con.fk_update_rule))
                throw new Error(`[${conDisplayName}] Unknown update rule: ${con.fk_update_rule}`);
        } else if (con.kind === 'FOREIGN KEY') {
            con.fk_update_rule = 'NO ACTION';
        }

        // --- Delete rule
        if (con.delete_rule || con.fk_delete_rule) {
            if (con.kind !== 'FOREIGN KEY')
                throw new Error(`[${conDisplayName}] Cannot specify "delete_rule" or "fk_delete_rule" on a non-foreign key constraint`);
            if (con.delete_rule && con.fk_delete_rule)
                throw new Error(`[${conDisplayName}] Only one of "delete_rule" or "fk_delete_rule" may be specified for a constraint`);

            con.fk_delete_rule = con.delete_rule || con.fk_delete_rule;

            if (!['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'].includes(con.fk_delete_rule))
                throw new Error(`[${conDisplayName}] Unknown delete rule: ${con.fk_delete_rule}`);
        } else if (con.kind === 'FOREIGN KEY') {
            con.fk_delete_rule = 'NO ACTION';
        }

        return con;
    }

    async resolve_indexDef({ ...idx }, resolve, options = {}) {
        const idxDisplayName = idx.name || 'INDEX';

        // --- Name
        if (idx.name) {
            if (typeof idx.name !== 'string')
                throw new Error(`[INDEX] Index name must be a string`);
            if (!/^\w/.test(idx.name))
                throw new Error(`[INDEX] Index name must start with a letter or underscore`);
        }

        if (!['column', 'expression'].includes(idx.kind))
            throw new Error(`[${idxDisplayName}] Unknown index kind: ${idx.kind}`);

        // --- Method
        if (!['hash'].includes(idx.method))
            throw new Error(`[${idxDisplayName}] Unsupported index method: ${idx.method}`);

        // --- Columns
        if (idx.columns) {
            if (idx.kind !== 'column')
                throw new Error(`[${idxDisplayName}] Cannot specify "columns" on an expression index`);
            if (!Array.isArray(idx.columns) || !idx.columns.length)
                throw new Error(`[${idxDisplayName}] The "columns" property must be an array, non-empty, when provided`);
            if (idx.column_ids)
                throw new Error(`[${idxDisplayName}] Only one of "columns" or "column_ids" may be specified for an index`);

            await resolve(idx, 'columns');
        } else if (idx.column_ids) {
            if (idx.kind !== 'column')
                throw new Error(`[${idxDisplayName}] Cannot specify "columns" on an expression index`);
            if (!Array.isArray(idx.column_ids) || !idx.column_ids.length)
                throw new Error(`[${idxDisplayName}] The system "column_ids" property must be an array, non-empty, when provided`);

            await resolve(idx, 'column_ids');
        }

        if (!idx.columns?.length && !idx.column_ids?.length && idx.kind === 'column')
            throw new Error(`[${idxDisplayName}] columns must be specified`);

        // --- Expression
        if (![undefined, null].includes(idx.expression)) {
            if (idx.kind !== 'expression')
                throw new Error(`[${idxDisplayName}] Cannot specify "expression" on a non-expression index`);
            if (!['string', 'number'].includes(typeof idx.expression))
                throw new Error(`[${idxDisplayName}] The "expression" property must be a string or number`);
            if (idx.expression_ast) throw new Error(`[${idxDisplayName}] Only one of "expression" or "expression_ast" may be specified for an index`);

            idx.expression_ast = (await registry.Expr.parse(idx.expression + '', { dialect: options.dialect || this.#dialect })).jsonfy();
        } else if (idx.expression_ast) {
            if (idx.kind !== 'expression')
                throw new Error(`[${idxDisplayName}] Cannot specify "expression" on a non-expression index`);
            if (typeof idx.expression_ast.nodeName !== 'string')
                throw new Error(`[${idxDisplayName}] The system "expression_ast" property must be a valid AST`);
        }

        if (!idx.expression && !idx.expression_ast && idx.kind === 'expression')
            throw new Error(`[${idxDisplayName}] expression must be specified`);

        return idx;
    }

    // AST-to-DEF

    literalAST_to_value(node) {
        if (node === null || node === undefined) return node;
        if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return node;
        if (typeof node.value === 'function') return node.value();
        return node.stringify ? node.stringify() : node;
    }

    configEntriesAST_to_patch(entries, { reset = false } = {}) {
        const patch = {};
        for (const entry of entries || []) {
            const left = entry.left?.();
            const entryValue = typeof entry?.value === 'function' ? entry.value() : entry?.value;
            const key = ((typeof left === 'string' ? left : left?.value?.()) || entryValue || '').toLowerCase();
            if (!key) continue;
            patch[key] = reset ? null : this.literalAST_to_value(entry.right?.() || entry);
        }
        return patch;
    }

    viewAST_to_viewDef(viewSchema, { namespace: defaultNsName = null, persistence = 'origin' } = {}) {
        const tableName = viewSchema.name().value();
        const nsName = viewSchema.name().qualifier()?.value() || defaultNsName;
        return {
            namespace: nsName,
            name: tableName,
            kind: 'view',
            persistence,
            columns: viewSchema.columns().map((col) => ({ name: col.value() })),
            view_spec: { query: viewSchema.query().jsonfy() },
        };
    }

    constraintAST_to_constraintDef(con, defaultNsName = null) {
        const maybeName = con?.name?.()?.value?.();
        if (con instanceof registry.TablePKConstraint) {
            return { kind: 'PRIMARY KEY', ...(maybeName ? { name: maybeName } : {}), columns: con.columns().map((c) => c.value()) };
        }
        if (con instanceof registry.TableUKConstraint) {
            return { kind: 'UNIQUE', ...(maybeName ? { name: maybeName } : {}), columns: con.columns().map((c) => c.value()) };
        }
        if (con instanceof registry.CheckConstraint) {
            return { kind: 'CHECK', ...(maybeName ? { name: maybeName } : {}), ck_expression_ast: con.expr().jsonfy() };
        }
        if (con instanceof registry.TableFKConstraint) {
            const targetTable = con.targetTable();
            const item = {
                kind: 'FOREIGN KEY',
                ...(maybeName ? { name: maybeName } : {}),
                columns: con.columns().map((c) => c.value()),
                target_namespace: targetTable.qualifier()?.value() || defaultNsName,
                target_relation: targetTable.value(),
            };
            const targetColumns = con.targetColumns()?.map((c) => c.value()) || [];
            if (targetColumns.length) item.target_columns = targetColumns;
            for (const rule of con.referentialRules?.() || []) {
                if (rule instanceof registry.FKMatchRule) item.match_rule = rule.value() === 'SIMPLE' ? 'NONE' : rule.value();
                else if (rule instanceof registry.FKUpdateRule) item.update_rule = rule.action().value();
                else if (rule instanceof registry.FKDeleteRule) item.delete_rule = rule.action().value();
            }
            return item;
        }
        throw new Error(`Unsupported constraint AST ${con?.NODE_NAME}`);
    }

    indexAST_to_indexDef(indexSchema, { tableRef = null, forceUnique = false } = {}) {
        const entries = indexSchema.entries();
        const isExpression = entries.some((entry) => !(entry instanceof registry.ColumnRef1 || entry instanceof registry.ColumnRef2));
        return {
            ...(tableRef ? { namespace: tableRef.namespace, table: tableRef.name } : {}),
            ...(indexSchema.name()?.value?.() ? { name: indexSchema.name().value() } : {}),
            kind: isExpression ? 'expression' : 'column',
            method: indexSchema.usingClause()?.method()?.value?.() || 'hash',
            is_unique: forceUnique || !!indexSchema.uniqueKW(),
            ...(isExpression
                ? { expression_ast: entries[0].jsonfy() }
                : { columns: entries.map((entry) => entry.value()) }),
        };
    }

    tableAlterActionAST_to_defs(action, { tableRef }) {
        if (action instanceof registry.AddTableAction) {
            const argument = action.argument();
            if (argument instanceof registry.ColumnSchema) {
                return [{ type: 'add_column', column: this.columnAST_to_columnDef(argument) }];
            }
            if (argument instanceof registry.IndexSchema) {
                return [{ type: 'add_index', index: this.indexAST_to_indexDef(argument, { tableRef }) }];
            }
            const constraint = this.constraintAST_to_constraintDef(argument, tableRef.namespace);
            if (action.name()?.value()) constraint.name = action.name().value();
            return [{ type: 'add_constraint', constraint }];
        }
        if (action instanceof registry.DropTableAction) {
            const type = action.columnKW() ? 'drop_column' : action.constraintKW() ? 'drop_constraint' : 'drop_index';
            return [{ type, name: action.name().value(), cascade: action.cascadeRule?.() === 'CASCADE' }];
        }
        if (action instanceof registry.RenameTableItemAction) {
            return [{
                type: action.columnKW() ? 'rename_column' : 'rename_index',
                oldName: action.oldName().value(),
                name: action.name().value(),
            }];
        }
        if (action instanceof registry.AlterColumnAction) {
            return [{
                type: 'alter_column',
                name: action.name().value(),
                operation: action.operationKind(),
                expr: action.expr()?.jsonfy?.() || null,
            }];
        }
        throw new Error(`Unsupported ALTER TABLE action ${action.NODE_NAME}`);
    }

    tableAST_to_tableDef(tableSchema, { namespace: defaultNsName = null, persistence = 'permanent' } = {}) {
        const tableName = tableSchema.name().value();
        const nsName = tableSchema.name().qualifier()?.value() || defaultNsName;

        const columns = tableSchema.columns().map((col) => {
            return this.columnAST_to_columnDef(col);
        });

        const constraints = [];
        const maybeName = (con) => con?.name?.()?.value?.();

        const pk = tableSchema.pkConstraint(true);
        if (pk) {
            const item = { kind: 'PRIMARY KEY', columns: pk.columns().map((c) => c.value()) };
            const name = maybeName(pk);
            if (name) item.name = name;
            constraints.push(item);
        }

        for (const uk of tableSchema.ukConstraints(true)) {
            const item = { kind: 'UNIQUE', columns: uk.columns().map((c) => c.value()) };
            const name = maybeName(uk);
            if (name) item.name = name;
            constraints.push(item);
        }

        for (const ck of tableSchema.ckConstraints(true)) {
            const item = { kind: 'CHECK', ck_expression_ast: ck.expr().jsonfy() };
            const name = maybeName(ck);
            if (name) item.name = name;
            constraints.push(item);
        }

        for (const fk of tableSchema.fkConstraints(true)) {
            const targetTable = fk.targetTable();
            const targetRelation = targetTable.value();
            const targetNamespace = targetTable.qualifier()?.value() || nsName;
            let targetColumns = fk.targetColumns()?.map((c) => c.value()) || [];

            if (!targetColumns.length && targetRelation === tableName && targetNamespace === nsName && pk) {
                targetColumns = pk.columns().map((c) => c.value());
            }

            const item = {
                kind: 'FOREIGN KEY',
                columns: fk.columns().map((c) => c.value()),
                target_namespace: targetNamespace,
                target_relation: targetRelation,
                target_columns: targetColumns.length ? targetColumns : undefined,
            };

            for (const rule of fk.referentialRules?.() || []) {
                if (rule instanceof registry.FKMatchRule) {
                    item.match_rule = rule.value() === 'SIMPLE' ? 'NONE' : rule.value();
                } else if (rule instanceof registry.FKUpdateRule) {
                    item.update_rule = rule.action().value();
                } else if (rule instanceof registry.FKDeleteRule) {
                    item.delete_rule = rule.action().value();
                }
            }

            const name = maybeName(fk);
            if (name) item.name = name;
            constraints.push(item);
        }

        for (const col of columns) Object.freeze(col);
        for (const con of constraints) Object.freeze(con);
        Object.freeze(columns);
        Object.freeze(constraints);
        return Object.freeze({
            namespace: nsName,
            name: tableName,
            persistence,
            columns,
            constraints,
        });
    }

    columnAST_to_columnDef(col) {
        const nullConstraint = col.nullConstraint();
        const defaultConstraint = col.defaultConstraint();
        const exprConstraint = col.expressionConstraint();
        const identityConstraint = col.identityConstraint();
        const autoIncrement = col.autoIncrementConstraint();

        const isGenerated = !!(exprConstraint || identityConstraint || autoIncrement);

        let generationRule = null;
        if (exprConstraint) generationRule = 'always';
        else if (identityConstraint) generationRule = identityConstraint.alwaysKW() ? 'always' : 'by_default';
        else if (autoIncrement) generationRule = 'by_default';

        return {
            name: col.name().value(),
            type: col.dataType().value(),
            not_null: nullConstraint && nullConstraint.value() === 'NOT',
            default_expr_ast: defaultConstraint?.expr()?.jsonfy() || null,
            is_generated: isGenerated,
            generation_expr_ast: exprConstraint?.expr()?.jsonfy() || null,
            generation_rule: generationRule,
        };
    }
}
