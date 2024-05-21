
import _isNumeric from '@webqit/util/js/isNumeric.js';
import _arrFrom from '@webqit/util/arr/from.js';
import Parser from '../../Parser.js';
import AbstractClient from '../AbstractClient.js';
import ODBDatabase from './ODBDatabase.js';

/**
 * ---------------------------
 * ODBClient class
 * ---------------------------
 */				
 
export default class ODBClient extends AbstractClient {

    /**
     * Instance.
     */
    constructor(params = {}) {
        super(params);
        this.$.data = {};
        this.kind = 'odb';
    }

	/**
     * Returns a list of databases.
     * 
     * @param Object params
     * 
     * @return Array
	 */
    async databases(params = {}) {
        const databaseList = Object.keys(this.$.schemas).map(name => ({ name }));
        return this.applyFilters(databaseList, params, this.systemDBs);
	}

	/**
     * Returns a database handle.
     * 
     * @param Array args
     * 
     * @return SQLDatabase
	 */
    async database(...args) {
        let databaseName, params = {};
        if (args.length === 2 || (args.length === 1 && _isObject(args[0]))) { params = args.pop(); }
        if (!(databaseName = args.pop()) && !(databaseName = await this.defaultDB())) {
            throw new Error(`Could not automatically resolve database name.`);
        }
        await this.createDatabaseIfNotExists(databaseName, params);
        return new ODBDatabase(this, databaseName, {
            schema: this.getDatabaseSchema(databaseName),
            data: this.$.data[databaseName],
        }, params);
    }

    /**
     * CREATE/DROP
     */

    /**
     * Creates.
     * 
     * @param String databaseName
     * @param Object params
     * 
     * @return Object
     */
    async createDatabase(databaseName, params = {}) {
        if ((await this.databases({ ...params, name: databaseName, version: null })).length) {
            if (params.ifNotExists) return;
            throw new Error(`Database ${ databaseName } already exists.`);
        }
        // ----------------
        this.setDatabaseSchema(databaseName, {});
        this.$.data[databaseName] = {};
        // ----------------
        return new ODBDatabase(this, databaseName, {
            schema: this.getDatabaseSchema(databaseName),
            data: this.$.data[databaseName],
        }, params);
    }

    /**
     * Drops a database.
     * 
     * @param String databaseName
     * @param Object params
     * 
     * @return Bool
     */
    async dropDatabase(databaseName, params = {}) {
        if (!(await this.databases({ ...params, name: databaseName, version: null })).length) {
            if (params.ifExists) return;
            throw new Error(`Database ${ databaseName } does not exist.`);
        }
        this.unsetDatabaseSchema(databaseName);
    }

    /**
     * ---------
     * QUERY
     * ---------
     */
    
    /**
     * @inheritdoc
     */
    async query(query, vars = [], params = {}) {
        return Parser.parse(query, null, { ...params, vars, dbClient: this }).eval(this);
    }
}