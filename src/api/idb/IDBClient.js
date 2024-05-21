

import _isNumeric from '@webqit/util/js/isNumeric.js';
import _arrFrom from '@webqit/util/arr/from.js';
import Parser from '../../Parser.js';
import AbstractClient from '../AbstractClient.js';
import IDBDatabase from './IDBDatabase.js';

/**
 * ---------------------------
 * IDBClient class
 * ---------------------------
 */				

export default class IDBClient extends AbstractClient {

    /**
     * @inheritdoc
	 */
    constructor(params = {}) {
        if (typeof indexedDB === 'undefined') { throw new Error('IndexedDB is not in scope.'); }
        super(params);
        this.indexedDB = indexedDB;
        this.kind = 'idb';
    }

	/**
     * Returns a list of databases.
     * 
     * @param Object params
     * 
     * @return Array
	 */
    async databases(params = {}) {
        const databaseList = _arrFrom(await this.indexedDB.databases());
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
		return new Promise((resolve, reject) => {
			const dbOpenRequest = this.indexedDB.open(databaseName, params.version || 1);
            dbOpenRequest.onerror = reject;
			dbOpenRequest.onsuccess = e => {
				resolve(new IDBDatabase(this, databaseName, e.target.result, params));
			};
		});
	}

    /**
     * CREATE/ALTER/DROP
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
            throw new Error(`Database ${databaseName} already exists.`);
        }
        this.client.$.schemas[databaseName] = {};
        return new Promise( async (resolve, reject) => {
            const dbOpenRequest = this.indexedDB.open(databaseName, params.version);
            dbOpenRequest.onerror = reject;
            dbOpenRequest.onupgradeneeded = e => {
                resolve(new IDBDatabase(this, databaseName, e.target.result, params));
            };
        });
    }

    /**
     * Initiates "alter DB".
     * 
     * @param String databaseName
     * @param Object params
     * 
     * @return Any
	 */
    async alterDatabase(databaseName, params) {
        const databses = await this.databases({ ...params, name: databaseName, version: null });
        if (!databses.length) {
            if (params.ifExists) return;
            throw new Error(`Database ${ databaseName } does not exist.`);
        }
        const nextVersion = databses.reduce((prev, db) => Math.max(prev, db.version), 0) + 1;
        if (params.version && (!_isNumeric(params.version) || params.version < nextVersion)) {
            throw new Error(`Database version (options.version) must be numeric and higher than ${ nextVersion - 1 }.`);
        }
        return new Promise((resolve, reject) => {
            const dbOpenRequest = this.indexedDB.open(databaseName, params.version || nextVersion);
            dbOpenRequest.onerror = reject;
            dbOpenRequest.onblocked = () => {
                // If some other tab is loaded with the database, then it needs to be closed
                // before we can proceed.
                this.userPrompt('Please close all open tabs of this site!');
            };
            dbOpenRequest.onupgradeneeded = e => {
                resolve(new IDBDatabase(this, databaseName, e.target.result, params));
            };
        });
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
        return new Promise((resolve, reject) => {
            const dbDeleteRequest = this.indexedDB.deleteDatabase(databaseName);
            dbDeleteRequest.onerror = reject;
            dbDeleteRequest.onsuccess = e => {
                delete this.client.$.schemas[databaseName];
                resolve(true);
            };
        });
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