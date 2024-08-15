
import Lexer from '../../lang/Lexer.js';
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
        super(driver, params);
    }

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
     * Returns a list of databases.
     * 
     * @param Object params
     * 
     * @return Array
	 */
    async databases() {
        const sql = `SELECT schema_name FROM information_schema.schemata`;
        const result = await this.driver.query(sql);
        return (result.rows || result).map(row => row.schema_name);
	}

    /**
     * Runs a query.
     * 
     * @param String            query
     * @param Object            params
     * 
     * @return Any
     */
    async query(query, params = {}) {
        return await this.queryCallback(async (query, params) => {
            if (query.expandable) await query.expand(true);
            const supportsReturnList = [InsertStatement,UpdateStatement,DeleteStatement].some(x => query instanceof x);
            let myReturningCallback;
            if (supportsReturnList && this.params.dialect === 'mysql' && query.RETURNING_LIST.length) {
                if (this.params.returningClause === false) throw new Error(`Support for the "RETURNING" clause has been disabled.`);
                [query, myReturningCallback] = await this.$myReturningMagic(query);
            }
            const bindings = (query.BINDINGS || []).concat(params.values || []).map(value => Array.isArray(value) || typeof value === 'object' && value ? JSON.stringify(value) : value);
            // _____________________
            let result = await this.driver.query(query.toString(), bindings);
            if (myReturningCallback) result = await myReturningCallback();
            // _____________________
            if (query instanceof SelectStatement || (supportsReturnList && query.RETURNING_LIST.length) || myReturningCallback) return result.rows || result;
            return 'rowCount' in result ? result.rowCount : result.affectedRows;
        }, ...arguments);
    }


	/**
	 * Initialise the logic for supporting the "RETURNING" clause in MySQL
	 */
	async $myReturningMagic(query) {
        query = query.clone();
        // ----------------------------------
        const selectList = query.RETURNING_LIST.splice(0);
        const tblName = query.$trace('get:name:table');
		const dbName = query.$trace('get:name:database');
        const tableIdent = Identifier.fromJSON(this, [dbName,tblName]);
        // ----------------------------------
        // Delete statements are handled ahead of the query
        if (query instanceof DeleteStatement) {
            const result = await this.driver.query(`SELECT ${ selectList.join(', ' ) } FROM ${ tableIdent }${ query.WHERE_CLAUSE ? ` WHERE ${ query.WHERE_CLAUSE }` : '' }`);
            return [query, () => result];
        }
        // Insert and update statements are post-handled
        // ----------------------------------
		const colName = 'obj_column_for_returning_clause_support';
        const columnIdent = Identifier.fromJSON(this, colName);
		await this.driver.query(`ALTER TABLE ${ tableIdent } ADD COLUMN ${ columnIdent } char(36) INVISIBLE`);
        const insertUuid = ( 0 | Math.random() * 9e6 ).toString( 36 );
        // ----------------------------------
		if (!query.SET_CLAUSE && query instanceof InsertStatement) {
			// Columns must be explicitly named
			if (!query.COLUMNS_CLAUSE && (query.SELECT_CLAUSE || query.VALUES_LIST.length)) {
				//query.columns(...columns);
                throw new Error(`Support for the RETURNING clause currently requires explicit column list in INSERT statements.`);
			}
			query.columns(colName);
			// Add to values list, or select list if that's what's being used
			if (query.SELECT_CLAUSE) {
				query.SELECT_CLAUSE.select(q => q.value(insertUuid));
			} else if (query.VALUES_LIST.length) {
				for (const values of query.VALUES_LIST) values.list(q => q.value(insertUuid));
			} else query.values(insertUuid);
		} else {
            query.set(colName, q => q.value(insertUuid));
        }
        if (query instanceof InsertStatement && query.ON_CONFLICT_CLAUSE) {
            query.ON_CONFLICT_CLAUSE.set(colName, q => q.value(insertUuid));
        }
        return [query, async () => {
            // ----------------------------------
            const result = await this.driver.query(`SELECT ${ selectList.join(', ' ) } FROM ${ tableIdent } WHERE ${ columnIdent } = '${ insertUuid }'`);
            await this.driver.query(`ALTER TABLE ${ tableIdent } DROP COLUMN ${ columnIdent }`);
            // ----------------------------------
            return result;
        }];
	}

    /**
     * Sets or returns the search path for resolving unqualified table references.
     * 
     * @param Array|String resolutionPath
     * 
     * @return Array
     */
    async basenameResolution(resolutionPath = []) {
        if (arguments.length) {
            resolutionPath = [].concat(resolutionPath).map(name => Identifier.fromJSON(this, name));
            const sql = this.params.dialect === 'mysql' ? `USE ${ resolutionPath[0] }` : `SET SEARCH_PATH TO ${ resolutionPath.join(',') }`;
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
}