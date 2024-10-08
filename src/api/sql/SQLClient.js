import Lexer from '../../lang/Lexer.js';
import { _intersect } from '@webqit/util/arr/index.js';
import Identifier from '../../lang/components/Identifier.js';
import InsertStatement from '../../lang/dml/insert/InsertStatement.js';
import UpdateStatement from '../../lang/dml/update/UpdateStatement.js';
import DeleteStatement from '../../lang/dml/delete/DeleteStatement.js';
import SelectStatement from '../../lang/dml/select/SelectStatement.js';
import AbstractClient from '../AbstractClient.js';
import SQLDatabase from './SQLDatabase.js';

export default class SQLClient extends AbstractClient {

    /**
     * Instance.
     * 
     * @param Object params 
     */
    constructor(driver, params = {}) {
        if (typeof driver !== 'object') throw new Error(`The options.driver parameter is required and must be an object.`);
        if (typeof driver.query !== 'function') throw new Error(`The provided driver must expose a .query() function.`);
        super({ driver, params });
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
     * Runs a query.
     * 
     * @param String            query
     * @param Object            params
     * 
     * @return Any
     */
    async query(query, params = {}) {
        return await this.queryCallback(async (target, query, params) => {
            const isDMLStatement = [InsertStatement,UpdateStatement,DeleteStatement].some(x => query instanceof x);
            const mysqlReturningSupport = isDMLStatement && this.params.dialect === 'mysql' && query.RETURNING_LIST.length;
            if (mysqlReturningSupport && !this.params.mysqlReturningClause) throw new Error(`Support for a "RETURNING" clause for mysql has not been enabled via "options.mysqlReturningClause".`);
            const willNeedStructure = query.expandable || mysqlReturningSupport;
            return await this.structure(willNeedStructure && { depth: 2, inSearchPathOrder: true }, async () => {
                const [ $query, $mysqlReturningMagicCallback ] = mysqlReturningSupport ? await this.$mysqlReturningMagic(target, query) : [ query ];
                // -----------
                const bindings = ($query.BINDINGS || []).concat(params.values || []).map(value => Array.isArray(value) || typeof value === 'object' && value ? JSON.stringify(value) : value);
                let result = await this.driver.query($query.toString(), bindings);
                if ($mysqlReturningMagicCallback) result = await $mysqlReturningMagicCallback();
                // -----------
                if (query instanceof SelectStatement || (isDMLStatement && query/*original*/.RETURNING_LIST.length)) return result.rows || result;
                return 'rowCount' in result ? result.rowCount : result.affectedRows;
            });
        }, ...arguments);
    }

    /**
     * Returns the application schema structure with specified level if detail.
     * 
     * @param Object|Array  selector
     * @param Array         ...rest
     * 
     * @return Array
	 */
    async structure(selector = {}, ...rest) {
        const getLevel2Details = async structure => {
            const [ sql0, sql1 ] = this.$composeSchemasSQL(structure);
            const columns = await this.driver.query(sql0);
            const constraints = await this.driver.query(sql1);
            return this.$formatSchemasResult(structure, (columns.rows || columns), (constraints.rows || constraints), []);
        };
        return await this.structureCallback(async selector => {
            // Structure provided?
            if (Array.isArray(selector)) return await getLevel2Details(selector);
            // Query structure
            const exclusions = 'excluding' in selector ? selector.excluding : [ 'information_schema' ];
            if (!Array.isArray(exclusions)) throw new Error(`If present, selector.excluding must be an array.`);
            // Compose the SQL
            const sql = `SELECT schema_name${ selector.depth ? ', table_name' : '' }
                FROM information_schema.schemata
                ${ selector.depth ? `LEFT JOIN information_schema.tables ON table_schema = schema_name AND table_type = 'BASE TABLE'` : '' }
                WHERE
                    ${ exclusions.length ? `schema_name NOT IN ('${ exclusions.join(`', '`) }')` : '' }
                    AND schema_name NOT LIKE 'pg_%'
                ${ selector.inSearchPathOrder ? `ORDER BY array_position(current_schemas(false), schema_name)` : '' };`;
            const result = await this.driver.query(sql);
            // Return bare db list?
            if (!selector.depth) return [...new Set((result.rows || result).map(row => ({ name: row.schema_name })))];
            // Add table details
            const structure = Object.values((result.rows || result).reduce((structure, row) => {
                if (!(row.schema_name in structure)) structure[row.schema_name] = { name: row.schema_name, tables: [] };
                if (row.table_name) structure[row.schema_name].tables.push(row.table_name);
                return structure;
            }, {}));
            if (selector.depth < 2) return structure;
            return await getLevel2Details(structure);
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
            const sql = this.params.dialect === 'mysql' ? `USE ${ searchPath[0] }` : `SET SEARCH_PATH TO ${ searchPath.join(',') }`;
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
	
	/**
	 * -------------------------------
	 */

	/**
	 * Initialise the logic for supporting the "RETURNING" clause in MySQL
	 */
	async $mysqlReturningMagic(target, query) {
        query = query.clone();
        const selectList = query.returning().splice(0);
        // -----------
        // Delete statements are handled ahead of the query
        if (query instanceof DeleteStatement) {
            const result = await this.driver.query(`SELECT ${ selectList.join(', ' ) } FROM ${ target }${ query.WHERE_CLAUSE ? ` WHERE ${ query.WHERE_CLAUSE }` : '' }`);
            return [query, () => result];
        }
        // Insert and update statements are post-handled
        // -----------
		const colName = 'obj_column_for_returning_clause_support';
        const columnIdent = Identifier.fromJSON(this, colName);
        const tblSchema = await this.database(target.prefix()).table(target.name()).structure();
		if (!tblSchema.column(colName)) await this.driver.query(`ALTER TABLE ${ target } ADD COLUMN ${ columnIdent } char(36) INVISIBLE`);
        const insertUuid = ( 0 | Math.random() * 9e6 ).toString( 36 );
        // -----------
        if (query.set())/*Both Insert & Update*/ {
            query.set(colName, q => q.value(insertUuid));
		} else if (query instanceof InsertStatement) {
			// Columns must be explicitly named
			if (!query.columns() && (query.select() || query.values().length)) {
				//query.columns(...columns);
                throw new Error(`Support for the RETURNING clause currently requires explicit column list in INSERT statements.`);
			}
			query.columns(colName);
			// Add to values list, or select list if that's what's being used
			if (query.select()) {
				query.select().select(q => q.value(insertUuid));
			} else if (query.values().length) {
				for (const values of query.values()) values.entries(q => q.value(insertUuid));
			} else query.values(insertUuid);
        }
        if (query instanceof InsertStatement && query.onConflict()) {
            query.onConflict().set(colName, q => q.value(insertUuid));
        }
        return [query, async () => {
            // -----------
            const result = await this.driver.query(`SELECT ${ selectList.join(', ' ) } FROM ${ target } WHERE ${ columnIdent } = '${ insertUuid }'`);
            if (this.params.mysqlReturningClause === 'WITH_AUTO_CLEANUP') await this.driver.query(`ALTER TABLE ${ target } DROP COLUMN ${ columnIdent }`);
            // -----------
            return result;
        }];
	}

    /**
     * Composes the SQL for a SHOW TABLE operation.
     * 
     * @param Array structure
     * 
     * @returns Array
     */
    $composeSchemasSQL(structure = []) {
        let dbWhere = '', tblWhere = '';
        const getWhere = (dbIdent, tblIdent) => {
            if (structure.length) dbWhere = `${ dbIdent } IN ('${ structure.map(x => x.name).join(`', '`) }')`;
            const tblWhereCases = structure.reduce((list, x) => {
                const tbls = [].concat(x.tables);
                if (tbls[0] === '*') return list;
                return list.concat(`WHEN '${ x.name }' THEN ${ tblIdent } IN ('${ tbls.join(`', '`) }')`);
            }, []);
            if (tblWhereCases.length) tblWhere = `CASE ${ dbIdent } ${ tblWhereCases.join(' ') } END`;
            const $where = tblWhere ? `${ dbWhere } AND ${ tblWhere }` : dbWhere;
            return $where ? `WHERE ${ $where }` : '';
        };
        const sql0 = `
        SELECT
            COLUMNS.table_schema,
            COLUMNS.table_name,
            COLUMNS.column_name,
            COLUMNS.ordinal_position,
            COLUMNS.column_default,
            COLUMNS.is_nullable,
            COLUMNS.data_type,
            COLUMNS.character_maximum_length,
            ${ this.params.dialect === 'mysql' ? `
            COLUMNS.extra,
            ` : `
            COLUMNS.is_identity,
            COLUMNS.identity_generation,
            COLUMNS.identity_start,
            COLUMNS.identity_increment,
            COLUMNS.identity_maximum,
            COLUMNS.identity_minimum,
            COLUMNS.identity_cycle,
            ` }
            COLUMNS.is_generated,
            COLUMNS.generation_expression
        FROM INFORMATION_SCHEMA.COLUMNS AS COLUMNS
        ${ getWhere('COLUMNS.TABLE_SCHEMA', 'COLUMNS.TABLE_NAME') }
        ORDER BY COLUMNS.ordinal_position
        `;
        const ANY_VALUE = col => this.params.dialect === 'mysql' ? col : `MAX(${ col })`;
        const GROUP_CONCAT = (col, orderBy) => this.params.dialect === 'mysql' ? `GROUP_CONCAT(${ col }${ orderBy ? ` ORDER BY ${ orderBy }` : `` } SEPARATOR ',')` : `STRING_AGG(${ col }, ','${ orderBy ? ` ORDER BY ${ orderBy }` : `` })`;
        const sql1 = `
        SELECT
            ${ ANY_VALUE(`TABLE_CONSTRAINTS.constraint_schema`) } AS table_schema,
            ${ ANY_VALUE(`TABLE_CONSTRAINTS.table_name`) } AS table_name,
            ${ GROUP_CONCAT(`TABLE_CONSTRAINTS_DETAILS.column_name`, `TABLE_CONSTRAINTS_DETAILS.ordinal_position`) } AS column_name,
            TABLE_CONSTRAINTS.constraint_name AS constraint_name,
            ${ ANY_VALUE(`TABLE_CONSTRAINTS.constraint_type`) } AS constraint_type,
            ${ ANY_VALUE(`CHECK_CONSTRAINTS_DETAILS.check_clause`) } AS check_clause,
            ${ this.params.dialect === 'mysql' ? `
            ${ ANY_VALUE(`CHECK_CONSTRAINTS_DETAILS.level`) } AS check_constraint_level,
            ${ GROUP_CONCAT(`TABLE_CONSTRAINTS_DETAILS.referenced_column_name`) } AS referenced_column_name,
            ${ ANY_VALUE(`TABLE_CONSTRAINTS_DETAILS.referenced_table_name`) } AS referenced_table_name,
            ${ ANY_VALUE(`TABLE_CONSTRAINTS_DETAILS.referenced_table_schema`) } AS referenced_table_schema,
            ` : `
            ${ GROUP_CONCAT(`RELATION_DETAILS.column_name`) } AS referenced_column_name,
            ${ ANY_VALUE(`RELATION_DETAILS.table_name`) } AS referenced_table_name,
            ${ ANY_VALUE(`RELATION_DETAILS.table_schema`) } AS referenced_table_schema,
            ` }
            --${ GROUP_CONCAT(`RELATION.unique_constraint_name`) } AS referenced_constraint_name,
            ${ ANY_VALUE(`RELATION.match_option`) } AS match_rule,
            ${ ANY_VALUE(`RELATION.update_rule`) } AS update_rule,
            ${ ANY_VALUE(`RELATION.delete_rule`) } AS delete_rule
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS TABLE_CONSTRAINTS
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS TABLE_CONSTRAINTS_DETAILS
            ON TABLE_CONSTRAINTS_DETAILS.CONSTRAINT_NAME = TABLE_CONSTRAINTS.CONSTRAINT_NAME
            AND TABLE_CONSTRAINTS_DETAILS.TABLE_NAME = TABLE_CONSTRAINTS.TABLE_NAME
            AND TABLE_CONSTRAINTS_DETAILS.CONSTRAINT_SCHEMA = TABLE_CONSTRAINTS.CONSTRAINT_SCHEMA
            AND TABLE_CONSTRAINTS_DETAILS.CONSTRAINT_CATALOG = TABLE_CONSTRAINTS.CONSTRAINT_CATALOG
        LEFT JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS AS CHECK_CONSTRAINTS_DETAILS
            ON CHECK_CONSTRAINTS_DETAILS.CONSTRAINT_NAME = TABLE_CONSTRAINTS.CONSTRAINT_NAME
            AND CHECK_CONSTRAINTS_DETAILS.CONSTRAINT_SCHEMA = TABLE_CONSTRAINTS.CONSTRAINT_SCHEMA
            AND CHECK_CONSTRAINTS_DETAILS.CONSTRAINT_CATALOG = TABLE_CONSTRAINTS.CONSTRAINT_CATALOG
        LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS AS RELATION
            ON RELATION.CONSTRAINT_NAME = TABLE_CONSTRAINTS.CONSTRAINT_NAME
            AND RELATION.CONSTRAINT_SCHEMA = TABLE_CONSTRAINTS.CONSTRAINT_SCHEMA
            AND RELATION.CONSTRAINT_CATALOG = TABLE_CONSTRAINTS.CONSTRAINT_CATALOG
        ${ this.params.dialect === 'mysql' ? '' : `
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS RELATION_DETAILS
            ON RELATION_DETAILS.CONSTRAINT_NAME = RELATION.UNIQUE_CONSTRAINT_NAME
            AND RELATION_DETAILS.CONSTRAINT_SCHEMA = RELATION.UNIQUE_CONSTRAINT_SCHEMA
            AND RELATION_DETAILS.CONSTRAINT_CATALOG = RELATION.UNIQUE_CONSTRAINT_CATALOG
            ` }
        ${ getWhere('TABLE_CONSTRAINTS.CONSTRAINT_SCHEMA', 'TABLE_CONSTRAINTS.TABLE_NAME') }
        GROUP BY (TABLE_CONSTRAINTS.constraint_name)
        `;
        return [sql0, sql1];
    }

    /**
     * Builds a schema object from the results of querying the information schema.
     * 
     * @param Array     structure
     * @param Array     columns
     * @param Array     constraints
     * @param Array     indexes
     * 
     * @returns Array
     */
    $formatSchemasResult(structure, columns, constraints, indexes) {
        // PG likes using verbose data types
        const dataType = val => val === 'character varying' ? 'varchar' : (val === 'integer' ? 'int' : val);
        const formatRelation = (key, tableScope = false) => ({
            ...(!tableScope ? { name: key.constraint_name } : {}),
            targetSchema: key.referenced_table_schema,
            targetTable: key.referenced_table_name,
            targetColumns: key.referenced_column_name.split(',').map(s => s.trim()),
            ...(key.match_rule !== 'NONE' ? { matchRule: key.match_rule } : {}),
            updateRule: key.update_rule,
            deleteRule: key.delete_rule,
        });
        const $structure = new Map((structure || []).map(x => [ x.name, new Map([].concat(x.tables || []).map(y => [ y, null ])) ]));
        for (const col of columns) {
            if (!$structure.has(col.table_schema)) $structure.set(col.table_schema, new Map);
            if (!$structure.get(col.table_schema).get(col.table_name)) {
                $structure.get(col.table_schema).set(col.table_name, {
                    columns: [col],
                    constraints: constraints.filter(cons => cons.table_schema === col.table_schema && cons.table_name === col.table_name),
                    indexes: indexes.filter(idx => idx.table_schema === col.table_schema && idx.table_name === col.table_name),
                });
            } else $structure.get(col.table_schema).get(col.table_name).columns.push(col);
        }
        return [ ...$structure.entries() ].map(([dbName, tables]) => {
            const databaseSchema = {
                name: dbName,
                tables: [ ...tables.entries() ].map(([tblName, tbl]) => {
                    // -----
                    const columnNames = tbl.columns.map(col => col.column_name);
                    const normalizeCheckConstraint = key => {
                        if (!key.check_clause) key.check_clause = ''; // Some wired stuff at Supabase
                        // Which columns are referenced in the check expr? We first eliminate all quoted strings, obtain all literals, and intersect with columnNames
                        const literals = (key.check_clause.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '').match( /\w+/g ) || []).map(s => s.toLowerCase());
                        key.columns = _intersect(columnNames, literals);
                        return key;
                    };
                    let [ primaryKey, uniqueKeys, foreignKeys, checks ] = tbl.constraints.reduce(([ primarys, uniques, foreigns, checks ], key) => {
                        if (key.constraint_type === 'PRIMARY KEY') return [ primarys.concat(key), uniques, foreigns, checks ];
                        if (key.constraint_type === 'UNIQUE') return [ primarys, uniques.concat(key), foreigns, checks ];
                        if (key.constraint_type === 'FOREIGN KEY') return [ primarys, uniques, foreigns.concat(key), checks ];
                        if (key.constraint_type === 'CHECK' && !(this.params.dialect === 'postgres' && /^[\d_]+not_null/.test(key.constraint_name))) return [ primarys, uniques, foreigns, checks.concat(normalizeCheckConstraint(key)) ];
                        return [ primarys, uniques, foreigns, checks ];
                    }, [[], [], [], []]);
                    // -----
                    const tableSchema = {
                        name: tblName,
                        columns: tbl.columns.reduce((cols, col) => {
                            const temp = {}, extras = col.extra/*mysql*/?.split(',').map(s => s.trim()) || [];
                            return cols.concat({
                                name: col.column_name,
                                type: col.character_maximum_length ? [ dataType(col.data_type), col.character_maximum_length ] : dataType(col.data_type),
                                ...(primaryKey.length === 1 && primaryKey[0].column_name === col.column_name && (temp.pKeys = primaryKey.pop()) ? {
                                    primaryKey: { name: temp.pKeys.constraint_name }
                                } : {}),
                                ...((temp.uKeys = uniqueKeys.filter(key => key.column_name === col.column_name)).length === 1 && (uniqueKeys = uniqueKeys.filter(key => key !== temp.uKeys[0])) ? {
                                    uniqueKey: { name: temp.uKeys[0].constraint_name }
                                } : {}),
                                ...((temp.fKeys = foreignKeys.filter(key => key.column_name === col.column_name)).length === 1 && (foreignKeys = foreignKeys.filter(key => key !== temp.fKeys[0])) ? {
                                    references: formatRelation(temp.fKeys[0])
                                } : {}),
                                ...((temp.cKeys = checks.filter(key => key.check_constraint_level !== 'Table' && key.columns.length === 1 && key.columns[0] === col.column_name)).length === 1 && (checks = checks.filter(key => key !== temp.cKeys[0])) ? {
                                    check: { name: temp.cKeys[0].constraint_name, expr: temp.cKeys[0].check_clause }
                                } : {}),
                                ...(col.is_identity/*postgres*/ === 'YES' ? {
                                    identity: { always: col.identity_generation === 'ALWAYS' }
                                } : {}),
                                ...(col.is_generated !== 'NEVER' ? {
                                    expression: { always: col.is_generated === 'ALWAYS', expr: col.generation_expression }
                                } : {}),
                                ...(extras.includes('auto_increment')/*mysql*/ ? {
                                    autoIncrement: true
                                } : {}),
                                ...(col.is_nullable === 'NO' ? {
                                    notNull: true
                                } : {}),
                                ...(col.column_default && col.column_default !== 'NULL' ? {
                                    default: { expr: col.column_default }
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
                        ...(key.constraint_type === 'FOREIGN KEY' ? { references: formatRelation(key, true) } : {}),
                    })));
                    tableSchema.constraints.push(...checks.map(key => ({
                        name: key.constraint_name,
                        type: key.constraint_type,
                        columns: key.columns,
                        expr: key.check_clause,
                    })));
                    return tableSchema;
                }),
            };
            return databaseSchema;
        });
    }
}