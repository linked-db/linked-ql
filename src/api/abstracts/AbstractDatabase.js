
import CreateTable from '../../query/create/CreateTable.js';
import DropTable from '../../query/drop/DropTable.js';
import Savepoint from './Savepoint.js';

export default class AbstractDatabase {
	
	/**
	 * @constructor
	 */
	constructor(client, dbName, params = {}) {
        Object.defineProperty(this, '$', { value: { client, name: dbName, params }});
	}

    /**
     * @property Client
     */
    get client() { return this.$.client; }

    /**
     * @property String
     */
    get name() { return this.$.name; }

    /**
     * @property Object
     */
    get params() { return this.$.params; }

    /**
     * Returns a table instance.
     * 
     * @param String            name
     * @param Object            params
     * 
     * @return Table
     */
    table(name, params = {}) {
        return new this.constructor.Table(this, ...arguments);
    }
	
    /**
     * Returns list of tables.
     * 
     * @return Array
     */
    async tables() { return []; }

    /**
     * Tells whether a table exists.
     * 
     * @param String            name
     * 
     * @return Bool
     */
    async hasTable(name) {
        return (await this.tables()).includes(name);
    }

    /**
     * Base logic for describeTable()
     * 
     * @param String|Array      tblName_s
     * @param Object            params
     * 
     * @return Object
     */
    async describeTable(tblName_s, params = {}) {
        const tblNames = [].concat(tblName_s);
        const isSingle = !Array.isArray(tblName_s) && tblName_s !== '*';
        const isAll = tblNames.length === 1 && tblNames[0] === '*';
        return isSingle ? null : [];
    }

    /**
     * Composes a CREATE TABLE query from descrete inputs
     * 
     * @param Object            createSpec
     * @param Object            params
     * 
     * @return Savepoint
     */
    async createTable(createSpec, params = {}) {
        if (typeof createSpec?.name !== 'string') throw new Error(`createTable() called with invalid arguments.`);
        // -- Compose an schemaInstamce from request
        const schemaInstamce = CreateTable.fromJson(this, createSpec);
        if (params.ifNotExists) schemaInstamce.withFlag('IF_NOT_EXISTS');
        return this.client.query(schemaInstamce, params);
    }

    /**
     * Composes an ALTER TABLE query from descrete inputs
     * 
     * @param String            tblName
     * @param Function          callback
     * @param Object            params
     * 
     * @return Savepoint
     */
    async alterTable(tblName, callback, params = {}) {
        if (typeof callback !== 'function' || typeof tblName !== 'string') throw new Error(`alterTable() called with invalid arguments.`);
        // -- Compose an altInstance from request
        const schemaJson = await this.describeTable(tblName);
        const schemaInstance = CreateTable.fromJson(this, schemaJson).keep(true, true);
        await callback(schemaInstance);
        const altInstance = schemaInstance.getAlt().with({ resultSchema: schemaInstance });
        if (!altInstance.ACTIONS.length) return;
        if (params.ifExists) altInstance.withFlag('IF_EXISTS');
        return this.client.query(altInstance, params);
    }

    /**
     * Composes a DROP TABLE query from descrete inputs
     * 
     * @param String            tblName
     * @param Object            params
     * 
     * @return Savepoint
     */
    async dropTable(tblName, params = {}) {
        if (typeof tblName !== 'string') throw new Error(`dropTable() called with invalid arguments.`);
        // -- Compose an dropInstamce from request
        const dropInstamce = DropTable.fromJson(this, { name: tblName });
        if (params.ifExists) dropInstamce.withFlag('IF_EXISTS');
        if (params.cascade) dropInstamce.withFlag('CASCADE');
        return this.client.query(dropInstamce, params);
    }

    /**
	 * Returns the database's current savepoint.
	 * 
     * @param Object params
	 * 
	 * @returns Object
     */
    async savepoint(params = {}) {
        const savepoints = await this.client.getSavepoints({ ...params, name: this.name });
        return savepoints[0];
    }
}