
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
     * @param Object            tblSchema
     * @param Object            params
     * 
     * @return Savepoint
     */
    async createTable(tblSchema, params = {}) {
        if (typeof tblSchema?.name !== 'string') throw new Error(`createTable() called with invalid arguments.`);
        // -- Compose an schemaInstamce from request
        const schemaInstamce = CreateTable.fromJson(this, tblSchema);
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
        const schemaInstance = CreateTable.fromJson(this, schemaJson).status('UP', 'UP');
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
        const OBJ_INFOSCHEMA_DB = this.client.constructor.OBJ_INFOSCHEMA_DB;
        if (!(await this.client.hasDatabase(OBJ_INFOSCHEMA_DB))) return;
        const tblName = [OBJ_INFOSCHEMA_DB,'database_savepoints'].join('.');
        const result = params.direction === 'forward'
            ? await this.client.query(`
                SELECT savepoint.*, preceding.id AS id_preceding FROM ${ tblName } AS savepoint
                LEFT JOIN ${ tblName } AS preceding ON preceding.database_tag = savepoint.database_tag AND COALESCE(preceding."$name", preceding.name) = savepoint.name AND preceding.version_tag < savepoint.version_tag
                WHERE COALESCE(savepoint.name, savepoint."$name") = '${ this.name }' AND savepoint.rollback_date IS NOT NULL AND (preceding.id IS NULL OR preceding.rollback_date IS NULL)
                ORDER BY savepoint.version_tag ASC LIMIT 1
            `)
            : await this.client.query(`
                SELECT savepoint.*, following.id AS id_following FROM ${ tblName } AS savepoint
                LEFT JOIN ${ tblName } AS following ON following.database_tag = savepoint.database_tag AND following.name = COALESCE(savepoint."$name", savepoint.name) AND following.version_tag > savepoint.version_tag
                WHERE COALESCE(savepoint."$name", savepoint.name) = '${ this.name }' AND savepoint.rollback_date IS NULL AND (following.id IS NULL OR following.rollback_date IS NOT NULL)
                ORDER BY savepoint.version_tag DESC LIMIT 1
            `);
        return result[0] && new Savepoint(this.client, result[0], params.direction);
    }
}