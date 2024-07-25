

import { _intersect } from '@webqit/util/arr/index.js';
import AbstractDatabase from '../AbstractDatabase.js';
import SQLTable from './SQLTable.js';

export default class SQLDatabase extends AbstractDatabase {
	
    /**
	 * SQLTable class.
     * 
     * @property Object
	 */
    static Table = SQLTable;

    /**
     * Returns a list of tables.

     * 
     * @return Array
	 */
    async tables() {
        const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = '${ this.name }'`;
        const result = await this.client.driver.query(sql);
        return (result.rows || result).map(row => row.table_name);
    }

     /**
     * Describes table.
     * 
     * @param String|Array      tblName_s
     * 
     * @return Object|Array
     */
    async describeTable(tblName_s) {
        return this.describeTableCallback(async (tblNames, isAll) => {
            const [ sql0, sql1 ] = this.getDescribeTableSql(tblNames);
            const columns = await this.client.driver.query(sql0);
            const constraints = await this.client.driver.query(sql1);
            return this.formatDescribeTableResult(tblNames, (columns.rows || columns), (constraints.rows || constraints), []);
        }, ...arguments);
    }
	
	/**
	 * -------------------------------
	 */

    /**
     * Composes the SQL for a SHOW TABLE operation.
     * 
     * @param Array tblNames
     * 
     * @returns Array
     */
    getDescribeTableSql(tblNames) {
        // SHOW CREATE TABLE isn't supported by postgreSql, plus we need that would add auto-added constraint names that the querying the information_schema adds
        const sql0 = `
        SELECT
            COLUMNS.column_name,
            COLUMNS.table_name,
            COLUMNS.ordinal_position,
            COLUMNS.column_default,
            COLUMNS.is_nullable,
            COLUMNS.data_type,
            COLUMNS.character_maximum_length,
            ${ this.client.params.dialect === 'mysql' ? '' : `
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

        WHERE COLUMNS.TABLE_SCHEMA='${ this.name }'
            ${ tblNames.length && tblNames[0] !== '*' ? `AND COLUMNS.TABLE_NAME IN ('${ tblNames.join(`','`) }')` : '' }
        ORDER BY COLUMNS.ordinal_position
        `;

        const ANY_VALUE = col => this.client.params.dialect === 'mysql' ? col : `ANY_VALUE(${ col })`;
        const GROUP_CONCAT = (col, orderBy) => this.client.params.dialect === 'mysql' ? `GROUP_CONCAT(${ col }${ orderBy ? ` ORDER BY ${ orderBy }` : `` } SEPARATOR ',')` : `STRING_AGG(${ col }, ','${ orderBy ? ` ORDER BY ${ orderBy }` : `` })`;

        const sql1 = `
        SELECT
            ${ ANY_VALUE(`TABLE_CONSTRAINTS.table_name`) } AS table_name,
            ${ GROUP_CONCAT(`TABLE_CONSTRAINTS_DETAILS.column_name`, `TABLE_CONSTRAINTS_DETAILS.ordinal_position`) } AS column_name,
            TABLE_CONSTRAINTS.constraint_name AS constraint_name,
            ${ ANY_VALUE(`TABLE_CONSTRAINTS.constraint_type`) } AS constraint_type,
            ${ ANY_VALUE(`CHECK_CONSTRAINTS_DETAILS.check_clause`) } AS check_clause,
                
            ${ this.client.params.dialect === 'mysql' ? `
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
        ${ this.client.params.dialect === 'mysql' ? '' : `
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS RELATION_DETAILS
            ON RELATION_DETAILS.CONSTRAINT_NAME = RELATION.UNIQUE_CONSTRAINT_NAME
            AND RELATION_DETAILS.CONSTRAINT_SCHEMA = RELATION.UNIQUE_CONSTRAINT_SCHEMA
            AND RELATION_DETAILS.CONSTRAINT_CATALOG = RELATION.UNIQUE_CONSTRAINT_CATALOG
            ` }

        WHERE TABLE_CONSTRAINTS.CONSTRAINT_SCHEMA = '${ this.name }'
            ${ tblNames.length && tblNames[0] !== '*' ? `AND TABLE_CONSTRAINTS.TABLE_NAME IN ('${ tblNames.join(`','`) }')` : '' }
        GROUP BY (TABLE_CONSTRAINTS.constraint_name)
        `;

        return [sql0, sql1];
    }

    /**
     * Builds a schema object from the results of querying the information schema.
     * 
     * @param Array tblNames
     * @param Array columns
     * @param Array constraints
     * @param Array indexes
     * 
     * @returns Object
     */
    formatDescribeTableResult(tblNames, columns, constraints, indexes) {
        // PG likes using verbose data types
        const dataType = val => val === 'character varying' ? 'varchar' : (val === 'integer' ? 'int' : val);
        const formatRelation = (key, tableScope = false) => ({
            ...(!tableScope ? { name: key.constraint_name } : {}),
            targetTable: [key.referenced_table_schema,key.referenced_table_name],
            targetColumns: key.referenced_column_name.split(',').map(s => s.trim()),
            ...(key.match_rule !== 'NONE' ? { matchRule: key.match_rule } : {}),
            updateRule: key.update_rule,
            deleteRule: key.delete_rule,
        });
        return (tblNames.length && tblNames[0] !== '*' ? tblNames : [...new Set(columns.map(col => col.table_name))]).map(tblName => {
            const $columns = columns.filter(col => col.table_name === tblName);
            const $constraints = constraints.filter(constr => constr.table_name === tblName);
            const $indexes = indexes.filter(constr => constr.table_name === tblName);
            // -----
            const columnNames = $columns.map(col => col.column_name);
            const normalizeCheckConstraint = key => {
                // Which columns are referenced in the check expr? We first eliminate all quoted strings, obtain all literals, and intersect with columnNames
                const literals = (key.check_clause.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '').match( /\w+/g ) || []).map(s => s.toLowerCase());
                key.columns = _intersect(columnNames, literals);
                return key;
            };
            let [ primaryKey, uniqueKeys, foreignKeys, checks ] = $constraints.reduce(([ primarys, uniques, foreigns, checks ], key) => {
                if (key.constraint_type === 'PRIMARY KEY') return [ primarys.concat(key), uniques, foreigns, checks ];
                if (key.constraint_type === 'UNIQUE') return [ primarys, uniques.concat(key), foreigns, checks ];
                if (key.constraint_type === 'FOREIGN KEY') return [ primarys, uniques, foreigns.concat(key), checks ];
                if (key.constraint_type === 'CHECK' && !(this.client.params.dialect === 'postgres' && /^[\d_]+not_null/.test(key.constraint_name))) return [ primarys, uniques, foreigns, checks.concat(normalizeCheckConstraint(key)) ];
                return [ primarys, uniques, foreigns, checks ];
            }, [[], [], [], []]);
            // -----
            const schema = {
                name: tblName,
                columns: $columns.reduce((cols, col) => {
                    const temp = {};
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
                        ...(col.is_identity !== 'NO' ? {
                            identity: { always: col.identity_generation === 'ALWAYS' }
                        } : {}),
                        ...(col.is_generated !== 'NEVER' ? {
                            expression: { always: col.is_generated === 'ALWAYS', expr: col.generation_expression }
                        } : {}),
                        ...(col.is_nullable === 'NO' ? {
                            notNull: true
                        } : {}),
                        ...(col.column_default ? {
                            default: { expr: col.column_default }
                        } : {}),
                    });
                }, []),
                constraints: [],
                indexes: [],
            };
            schema.constraints.push(...[...primaryKey, ...uniqueKeys, ...foreignKeys].map(key => ({
                name: key.constraint_name,
                type: key.constraint_type === 'UNIQUE' ? 'UNIQUE_KEY' : key.constraint_type,
                columns: key.column_name.split(',').map(col => col.trim()),
                ...(key.constraint_type === 'FOREIGN KEY' ? { references: formatRelation(key, true) } : {}),
            })));
            schema.constraints.push(...checks.map(key => ({
                name: key.constraint_name,
                type: key.constraint_type,
                columns: key.columns,
                expr: key.check_clause,
            })));
            return schema;
        });
    }
}