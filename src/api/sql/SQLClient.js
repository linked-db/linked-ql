import { Lexer } from '../../lang/Lexer.js';
import { _intersect } from '@webqit/util/arr/index.js';
import { Identifier } from '../../lang/expr/Identifier.js';
import { DeleteStatement } from '../../lang/dml/DeleteStatement.js';
import { InsertStatement } from '../../lang/dml/InsertStatement.js';
import { AbstractClient } from '../AbstractClient.js';
import { SQLDatabase } from './SQLDatabase.js';
import { Parser } from '../../lang/Parser.js';

export class SQLClient extends AbstractClient {

    /**
     * Instance.
     * 
     * @param Object params 
     */
    constructor(driver, params = {}) {
        if (typeof driver !== 'object') throw new Error(`The options.driver parameter is required and must be an object.`);
        if (typeof driver.query !== 'function') throw new Error(`The provided driver must expose a .query() function.`);
        super(params);
        this.$.driver = driver;
    }

    /**
     * @property Driver
     */
    get driver() { return this.$.driver; }

    /**
     * Client kind.
     * 
     * @property String
     */
    static kind = 'sql';

    /**
     * Database class.
     * 
     * @property Object
     */
    static Database = SQLDatabase;

    /**
     * Returns the application schema structure with specified level if detail.
     * 
     * @param Object|Array  params
     * @param Array         ...rest
     * 
     * @return Array
     */
    async schema(params) {
        return super.schema(async (params) => {
            const sql = this.#composeSchemaSQL(params);
            const result = await this.driver.query(sql);
            return this.#formatSchemasResult((result.rows || result));
        }, ...arguments);
    }

    /**
     * Sets or returns the search path for resolving unqualified table references.
     * 
     * @param Array|String searchPath
     * 
     * @return Array
     */
    async searchPath(searchPath = []) {
        if (arguments.length) {
            searchPath = [].concat(searchPath).map(name => Identifier.fromJSON(this, name));
            const sql = this.params.dialect === 'mysql' ? `USE ${searchPath[0]}` : `SET SEARCH_PATH TO ${searchPath.join(',')}`;
            return await this.driver.query(sql);
        }
        let sql, key;
        if (this.params.dialect === 'mysql') {
            sql = 'SELECT database() AS default_db', key = 'default_db';
        } else {
            sql = `SHOW SEARCH_PATH`, key = 'search_path'; // Can't remember what happens here
            sql = `SELECT current_setting('SEARCH_PATH')`, key = 'current_setting';
        }
        const result = await this.driver.query(sql);
        const value = ((result.rows || result)[0] || {})[key];
        return Lexer.split(value, [',']).map(s => Identifier.parseIdent(this, s.trim())[0]);
    }

    async execDQL(query, queryBindings = [], params = {}) {
        return await this.execSQL(query, queryBindings, params);
    }

    async execDML(query, queryBindings = []) {
        const vars = { hasReturnList: !!query.returning() };
        const mysqlReturningSupport = this.params.dialect === 'mysql' && vars.hasReturnList;
        if (mysqlReturningSupport) {
            [query, vars.mysqlPostHook] = await this.#mysqlReturningMagic(query);
        }
        vars.returnValue = await this.driver.query(query.toString(), queryBindings);
        if (vars.mysqlPostHook) {
            vars.returnValue = await vars.mysqlPostHook(vars.returnValue);
        }
        if (vars.hasReturnList) return vars.returnValue.rows || vars.returnValue;
        return 'rowCount' in vars.returnValue ? vars.returnValue.rowCount : vars.returnValue.affectedRows;
    }

    async execDDL(query, rootSchema, params = {}) {
        return super.execDDL(async (query) => {
            return await this.driver.query(query.toString()); 
        }, ...arguments);
    }

    async execSQL(query, queryBindings = []) {
        const returnValue = await this.driver.query(query.toString(), queryBindings);
        return returnValue.rows || returnValue;
    }

    /**
     * ----------------
     */

    async getPID() {
        return super.getPID(async () => {
            const result = await this.driver.query(`SELECT ${ this.params.dialect === 'mysql' ? 'connection_id()' : 'pg_backend_pid()' } AS pid`);
            return (result.rows || result)[0]?.pid;
        });
    }

    listen(channel, callback, ownEvents = false) {
        return super.listen((channel, handle) => {
            this.driver.query(`LISTEN ${channel}`);
            this.driver.on('notification', async (e) => {
                if (e.channel === channel) handle(e);
            });
        }, ...arguments);
    }

    /**
     * ----------------
     */

    /**
     * Initialise the logic for supporting the "RETURNING" clause in MySQL
     */
    async #mysqlReturningMagic(query) {
        if (query.tables().length > 1) {
            throw new Error(`The support for a "RETURNING" clause for mysql does'nt yet support muilt-table statements.`);
        }
        query = query.clone();
        const tableRef = query.tables()[0].expr().clone();
        const returningClause = query.returning();
        // Disconnect from query
        query.returning(undefined);
        // -----------
        // Delete statements are handled ahead of the query
        if (query instanceof DeleteStatement) {
            const result = await this.driver.query(`SELECT ${returningClause} FROM ${tableRef}${query.where() || ''}`);
            return [query, () => result];
        }
        // Insert and update statements are post-handled
        // -----------
        const colName = 'obj_column_for_returning_clause_support';
        const columnIdent = Identifier.fromJSON(this, colName);
        const tblSchema = tableRef.schema();
        if (!tblSchema.column(colName)) await this.driver.query(`ALTER TABLE ${tableRef} ADD COLUMN ${columnIdent} char(36) INVISIBLE`);
        const insertUuid = (0 | Math.random() * 9e6).toString(36);
        // -----------
        if (query.set())/*Both Insert & Update*/ {
            query.set().assignment(colName, q => q.value(insertUuid));
        } else if (query instanceof InsertStatement) {
            // Columns must be explicitly named
            if (!query.columns() && (query.select() || query.values()?.length)) {
                //query.columns(...columns);
                throw new Error(`The support for a "RETURNING" clause for mysql currently requires explicit column list in INSERT statements.`);
            }
            query.columns().add(colName);
            // Add to values list, or select list if that's what's being used
            if (query.select()) {
                query.select().fields().add(q => q.value(insertUuid));
            } else if (query.values()?.length) {
                for (const valuesSpec of query.values()) valuesSpec.add(q => q.value(insertUuid));
            } else query.values(insertUuid);
        }
        if (query instanceof InsertStatement && query.onConflict()) {
            query.onConflict().assignment(colName, q => q.value(insertUuid));
        }
        return [query, async () => {
            // -----------
            const result = await this.driver.query(`SELECT ${returningClause} FROM ${target} WHERE ${columnIdent} = '${insertUuid}'`);
            if (this.params.mysqlReturningClause === 'WITH_AUTO_CLEANUP') await this.driver.query(`ALTER TABLE ${target} DROP COLUMN ${columnIdent}`);
            // -----------
            return result;
        }];
    }

    /**
     * Compose the SQL that generates schemas
     * 
     * @param Array|Object      params
     * 
     * @returns Array
     */
    #composeSchemaSQL(params = {}) {
        // -- HOW WE MATCH NAMES
        const utils = this.createCommonSQLUtils();
        // -- SELECTOR
        const $parts = {
            fields: [],
            dbWhere: '',
            tblWhere: '',
            orderBy: '',
            depth: 0
        };
        if (Array.isArray(params)) {
            $parts.dbWhere = `\nWHERE db.schema_name IN ('${params.map(s => s.name).join(`', '`)}')`;
            const $tblWhere = params.reduce((cases, s) => {
                const tbls = [].concat(s.tables || []);
                if (!tbls.length || tbls.includes('*')) return cases;
                return cases.concat(`WHEN '${s.name}' THEN ${utils.matchSelector('tbl.table_name', tbls)}`);
            }, []);
            $parts.tblWhere = $tblWhere.length ? ` AND CASE db.schema_name ${$tblWhere.join(' ')} END` : '';
            $parts.depth = 2;
        } else {
            const schemaSelector = [].concat(params.selector || []);
            if (schemaSelector.length) {
                const $dbWhere = utils.matchSelector('db.schema_name', schemaSelector);
                $parts.dbWhere = $dbWhere ? `\nWHERE ${$dbWhere}` : '';
            }
            $parts.orderBy = `\nORDER BY array_position(current_schemas(false), db.schema_name)`;
            $parts.depth = params.depth || 0;
        }
        // -- THE COLUMNS PART
        const buildColumns = () => {
            // Composition
            const fields = {
                table_schema: `cols.table_schema`,
                table_name: `cols.table_name`,
                column_name: `cols.column_name`,
                ordinal_position: `cols.ordinal_position`,
                column_default: `cols.column_default`,
                is_nullable: `cols.is_nullable`,
                data_type: `cols.data_type`,
                character_maximum_length: `cols.character_maximum_length`,
                ...(this.params.dialect === 'mysql' ? {
                    extra: `cols.extra`,
                } : {
                    is_identity: `cols.is_identity`,
                    identity_generation: `cols.identity_generation`,
                    identity_start: `cols.identity_start`,
                    identity_increment: `cols.identity_increment`,
                    identity_maximum: `cols.identity_maximum`,
                    identity_minimum: `cols.identity_minimum`,
                    identity_cycle: `cols.identity_cycle`,
                }),
                is_generated: `cols.is_generated`,
                generation_expression: `cols.generation_expression`,
            };
            const baseQuery = `
                SELECT ${Object.entries(fields).map(([k, v]) => `${v} AS ${k}`).join(', ')}
                FROM information_schema.columns AS cols
                WHERE cols.table_schema = tbl.table_schema AND cols.table_name = tbl.table_name
                ORDER BY cols.ordinal_position
            `;
            // Return as an aggregation
            return `SELECT ${utils.jsonAgg(
                utils.jsonBuildObject(Object.keys(fields).reduce(($fields, f) => $fields.concat(`'${f}'`, `cols.${f}`), []))
            )} FROM (${baseQuery}) AS cols`;
        };
        // -- THE CONSTRAINS PART
        const buildConstraints = () => {
            // Composition
            const fields = {
                table_schema: utils.anyValue(`cons.constraint_schema`),
                table_name: utils.anyValue(`cons.table_name`),
                column_name: utils.groupConcat(`cons_details.column_name`, `cons_details.ordinal_position`),
                constraint_name: `cons.constraint_name`,
                constraint_type: utils.anyValue(`cons.constraint_type`),
                check_clause: utils.anyValue(`check_constraints_details.check_clause`),
                ...(this.params.dialect === 'mysql' ? {
                    check_constraint_level: utils.anyValue(`check_constraints_details.level`),
                    referenced_column_name: utils.groupConcat(`cons_details.referenced_column_name`),
                    referenced_table_name: utils.anyValue(`cons_details.referenced_table_name`),
                    referenced_table_schema: utils.anyValue(`cons_details.referenced_table_schema`),
                } : {
                    referenced_column_name: utils.groupConcat(`relation_details.column_name`),
                    referenced_table_name: utils.anyValue(`relation_details.table_name`),
                    referenced_table_schema: utils.anyValue(`relation_details.table_schema`),
                }),
                referenced_constraint_name: utils.groupConcat(`relation.unique_constraint_name`),
                match_rule: utils.anyValue(`relation.match_option`),
                update_rule: utils.anyValue(`relation.update_rule`),
                delete_rule: utils.anyValue(`relation.delete_rule`),
            };
            const baseQuery = `
                SELECT ${Object.entries(fields).map(([k, v]) => `${v} AS ${k}`).join(', ')}
                FROM information_schema.table_constraints AS cons
                LEFT JOIN information_schema.key_column_usage AS cons_details
                    ON cons_details.constraint_name = cons.constraint_name
                    AND cons_details.table_name = cons.table_name
                    AND cons_details.constraint_schema = cons.constraint_schema
                    AND cons_details.constraint_catalog = cons.constraint_catalog
                LEFT JOIN information_schema.check_constraints AS check_constraints_details
                    ON check_constraints_details.constraint_name = cons.constraint_name
                    AND check_constraints_details.constraint_schema = cons.constraint_schema
                    AND check_constraints_details.constraint_catalog = cons.constraint_catalog
                LEFT JOIN information_schema.referential_constraints AS relation
                    ON relation.constraint_name = cons.constraint_name
                    AND relation.constraint_schema = cons.constraint_schema
                    AND relation.constraint_catalog = cons.constraint_catalog
                ${this.params.dialect === 'mysql' ? '' : `
                LEFT JOIN information_schema.key_column_usage AS relation_details
                    ON relation_details.constraint_name = relation.unique_constraint_name
                    AND relation_details.constraint_schema = relation.unique_constraint_schema
                    AND relation_details.constraint_catalog = relation.unique_constraint_catalog
                    ` }
                WHERE cons.table_schema = tbl.table_schema AND cons.table_name = tbl.table_name
                GROUP BY cons.constraint_name
            `;
            // Return as an aggregation
            return `SELECT ${utils.jsonAgg(
                utils.jsonBuildObject(Object.keys(fields).reduce(($fields, f) => $fields.concat(`'${f}'`, `cons.${f}`), []))
            )} FROM (${baseQuery}) AS cons`;
        };
        // -- THE TABLE PART
        const buildTable = (detailed = false) => {
            // Composition
            const fields = { table_name: `tbl.table_name`, table_schema: `tbl.table_schema` };
            const baseQuery = `
                SELECT ${Object.entries(fields).map(([k, v]) => `${v} AS ${k}`).join(', ')}
                FROM information_schema.tables AS tbl
                WHERE tbl.table_schema = db.schema_name AND tbl.table_type = 'BASE TABLE'${$parts.tblWhere}
            `;
            // Return as an aggregation
            const branches = detailed ? [`'columns'`, `(${buildColumns()})`, `'constraints'`, `(${buildConstraints()})`] : [];
            return `SELECT ${utils.jsonAgg(
                utils.jsonBuildObject(Object.keys(fields).reduce(($fields, f) => $fields.concat(`'${f}'`, `tbl.${f}`), []).concat(branches))
            )} FROM (${baseQuery}) AS tbl`;
        };
        $parts.fields.push('db.schema_name');
        if ($parts.depth) $parts.fields.push(`(${buildTable($parts.depth > 1)}) AS tables`);
        const sql = `SELECT ${$parts.fields.join(', ')}
        FROM information_schema.schemata AS db
        ${$parts.dbWhere}${$parts.orderBy};`;
        return sql;
    }

    /**
     * Formats the result of #composeSchemaSQL().
     * 
     * @param Array             result
     * 
     * @returns Array
     */
    #formatSchemasResult(result) {
        // PG likes using verbose data types
        const dataType = val => val === 'character varying' ? 'varchar' : (val === 'integer' ? 'int' : val);
        const formatRelation = (key, tableScope = false) => ({
            ...(!tableScope ? { name: key.constraint_name } : {}),
            targetTable: [key.referenced_table_schema, key.referenced_table_name],
            targetColumns: key.referenced_column_name.split(',').map(s => s.trim()),
            ...(key.match_rule !== 'NONE' ? { matchRule: key.match_rule } : {}),
            updateRule: key.update_rule,
            deleteRule: key.delete_rule,
        });
        const parseJsonfyExpr = (expr, withColumns = false) => {
            const columns = new Set;
            const node = Parser.parse({ params: !withColumns ? this.params : { ...this.params, nodeCallback: (node) => node.NODE_NAME === 'COLUMN_REF' ? columns.add(node.name().toLowerCase()) : null }}, expr, null, { inspect: false });
            const json = node.NODE_NAME === 'PARENS' ? node.exprUnwrapped().jsonfy({ nodeNames: false }) : node.jsonfy({ nodeNames: false });
            return withColumns ? { columns: [...columns], json } : json;
        };
        return result.map(db => {
            const databaseSchema = {
                name: db.schema_name,
                tables: (db.tables || []).map(tbl => {
                    // -----
                    const normalizeCheckConstraint = key => {
                        if (!key.check_clause) key.check_clause = ''; // Some wired stuff at Supabase
                        return {...key, ...parseJsonfyExpr(key.check_clause, true)};
                    };
                    let [primaryKey, uniqueKeys, foreignKeys, checks] = (tbl.constraints || []).reduce(([primarys, uniques, foreigns, checks], key) => {
                        if (key.constraint_type === 'PRIMARY KEY') return [primarys.concat(key), uniques, foreigns, checks];
                        if (key.constraint_type === 'UNIQUE') return [primarys, uniques.concat(key), foreigns, checks];
                        if (key.constraint_type === 'FOREIGN KEY') return [primarys, uniques, foreigns.concat(key), checks];
                        if (key.constraint_type === 'CHECK' && !(this.params.dialect === 'postgres' && /^[\d_]+not_null/.test(key.constraint_name))) return [primarys, uniques, foreigns, checks.concat(normalizeCheckConstraint(key))];
                        return [primarys, uniques, foreigns, checks];
                    }, [[], [], [], []]);
                    // -----
                    const tableSchema = {
                        name: tbl.table_name,
                        columns: (tbl.columns || []).reduce((cols, col) => {
                            const temp = {}, extras = col.extra/*mysql*/?.split(',').map(s => s.trim()) || [];
                            return cols.concat({
                                name: col.column_name,
                                type: col.character_maximum_length ? [dataType(col.data_type), col.character_maximum_length] : dataType(col.data_type),
                                ...(primaryKey.length === 1 && primaryKey[0].column_name === col.column_name && (temp.pKeys = primaryKey.pop()) ? {
                                    primaryKey: { name: temp.pKeys.constraint_name }
                                } : {}),
                                ...((temp.uKeys = uniqueKeys.filter(key => key.column_name === col.column_name)).length === 1 && (uniqueKeys = uniqueKeys.filter(key => key !== temp.uKeys[0])) ? {
                                    uniqueKey: { name: temp.uKeys[0].constraint_name }
                                } : {}),
                                ...((temp.fKeys = foreignKeys.filter(key => key.column_name === col.column_name)).length === 1 && (foreignKeys = foreignKeys.filter(key => key !== temp.fKeys[0])) ? {
                                    foreignKey: formatRelation(temp.fKeys[0])
                                } : {}),
                                ...((temp.cKeys = checks.filter(key => key.check_constraint_level !== 'Table' && key.columns.length === 1 && key.columns[0] === col.column_name)).length === 1 && (checks = checks.filter(key => key !== temp.cKeys[0])) ? {
                                    check: { name: temp.cKeys[0].constraint_name, expr: temp.cKeys[0].json }
                                } : {}),
                                ...(col.is_identity/*postgres*/ === 'YES' ? {
                                    identity: { always: col.identity_generation === 'ALWAYS' }
                                } : {}),
                                ...(col.is_generated !== 'NEVER' ? {
                                    expression: { always: col.is_generated === 'ALWAYS', expr: parseJsonfyExpr(col.generation_expression) }
                                } : {}),
                                ...(extras.includes('auto_increment')/*mysql*/ ? {
                                    autoIncrement: true
                                } : {}),
                                ...(col.is_nullable === 'NO' ? {
                                    notNull: true
                                } : {}),
                                ...(col.column_default && col.column_default !== 'NULL' ? {
                                    default: { expr: parseJsonfyExpr(col.column_default) }
                                } : {}),
                                ...(extras.includes('INVISIBLE') ? {
                                    flags: ['INVISIBLE']
                                } : {}),
                            });
                        }, []),
                        constraints: [],
                        indexes: [],
                    };
                    tableSchema.constraints.push(...[...primaryKey, ...uniqueKeys, ...foreignKeys].map(key => ({
                        name: key.constraint_name,
                        type: key.constraint_type === 'UNIQUE' ? 'UNIQUE_KEY' : key.constraint_type.replace(' ', '_'),
                        columns: key.column_name.split(',').map(col => col.trim()),
                        ...(key.constraint_type === 'FOREIGN KEY' ? formatRelation(key, true) : {}),
                    })));
                    tableSchema.constraints.push(...checks.map(key => ({
                        name: key.constraint_name,
                        type: key.constraint_type,
                        columns: key.columns,
                        expr: key.json,
                    })));
                    return tableSchema;
                }),
            };
            return databaseSchema;
        });
    }
}