
import Identifier from '../../query/select/Identifier.js';
import Lexer from '../../query/Lexer.js';
import Parser from '../../query/Parser.js';
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
	 * List: system database.
     * 
     * @var Array
	 */
    static systemDBs = [ 'information_schema', 'mysql', 'performance_schema', 'sys', 'pg_catalog', 'pg_toast' ];

	/**
	 * Sets default database.
	 * 
	 * @param String dbName
	 * @param Object params
     * 
     * @return String|Null
	 */
	async searchPath(...args) {
        return this.searchPathCallback(path => {
            return new Promise((resolve, reject) => {
                const driver = this.driver;
                if (path) {
                    path = path.map(name => Identifier.fromJson(this, name));
                    const sql = this.params.dialect === 'mysql' ? `USE ${ path[0] }` : `SET SEARCH_PATH TO ${ path.join(',') }`;
                    return driver.query(sql, (err, result) => {
                        if (err) return reject(err);
                        resolve(result);
                    });
                }
                let sql, key;
                if (this.params.dialect === 'mysql') {
                    sql = 'SELECT database() AS default_db', key = 'default_db';
                } else {
                    // Here, what we need is SHOW SEARCH_PATH not SELECT current_database()
                    sql = `SHOW SEARCH_PATH`, key = 'search_path';
                    sql = `SELECT current_setting('SEARCH_PATH')`, key = 'current_setting';
                }
                return driver.query(sql, (err, result) => {
                    if (err) return reject(err);
                    const rows = result.rows || result;
                    const value = (rows[0] || {})[key];
                    resolve(Lexer.split(value, [',']).map(s => Identifier.parseIdent(this, s.trim())[0]));
                });
            });
        }, ...args);
	}

	/**
     * Returns a list of databases.
     * 
     * @param Object params
     * 
     * @return Array
	 */
    async databases(params = {}) {
        return this.databasesCallback(() => {
            return new Promise((resolve, reject) => {
                const sql = `SELECT schema_name FROM information_schema.schemata`;
                return this.driver.query(sql, (err, result) => {
                    if (err) return reject(err);
                    resolve((result.rows || result).map(row => row.schema_name));
                });
            });
        }, params, this.constructor.systemDBs);
	}

    /**
     * Creates a database.
     * 
     * @param String dbName
     * @param Object params
     * 
     * @return Bool
     */
    async createDatabase(dbName, params = {}) {
        return this.createDatabaseCallback((dbCreateInstance, handleTables, params) => {
            return new Promise((resolve, reject) => {
                return this.driver.query(dbCreateInstance.toString(), (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }, ...arguments);
    }

    /**
     * Alters a database.
     * 
     * @param String    dbName
     * @param Function  schemaCallback
     * @param Object    params
     * 
     * @return Bool
     */
    async alterDatabase(dbName, schemaCallback, params = {}) {
        return this.alterDatabaseCallback(async (dbAlterInstance, handleTables, params) => {
            if (!dbAlterInstance.ACTIONS.length) return;
            await handleTables(); // Handle tables before rename DB
            return new Promise((resolve, reject) => {
                return this.driver.query(dbAlterInstance.toString(), (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }, ...arguments);
    }

    /**
     * Drops a database.
     * 
     * @param String dbName
     * @param Object params
     * 
     * @return Bool
     */
    async dropDatabase(dbName, params = {}) {
        return this.dropDatabaseCallback((dbDropInstance, params) => {
            return new Promise((resolve, reject) => {
                return this.driver.query(dbDropInstance.toString(), (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }, ...arguments);
    }

    /**
     * ---------
     * QUERY
     * ---------
     */
	 
	/**
     * @inheritdoc
	 */
	async query(query, params = {}) {
        return this.queryCallback((query, params) => {
            return new Promise((resolve, reject) => {
                this.driver.query(`${ query }`, (err, result) => {
                    if (err) return reject(err);
                    resolve(result.rows || result);
                });
            });
        }, query, params, true/*acceptsSql*/);
    }
}