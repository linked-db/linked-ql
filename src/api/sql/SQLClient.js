
import Lexer from '../../query/Lexer.js';
import Identifier from '../../query/select/Identifier.js';
import AbstractClient from '../abstracts/AbstractClient.js';
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
        return await this.queryCallback(async (queryInstance, params) => {
            if (queryInstance.expandable) await queryInstance.expand(true);
            const result = await this.driver.query(queryInstance.toString(), params.params || []);
            return result.rows || result;
        }, ...arguments);
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
            resolutionPath = [].concat(resolutionPath).map(name => Identifier.fromJson(this, name));
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