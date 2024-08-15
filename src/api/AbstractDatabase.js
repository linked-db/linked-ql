
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import TableSchema from '../lang/schema/tbl/TableSchema.js';

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
    get params() { return Object.assign({}, this.client.params, this.$.params); }
    
	/**
	 * A generic method for tracing something up the node tree.
	 * Like a context API.
	 * 
	 * @param String request
	 * @param Array ...args
     * 
     * @returns any
	 */
	$trace(request, ...args) {
		if (request === 'get:api:database') return this;
		if (request === 'get:name:database') return this.name;
        return this.client.$trace(request, ...args);
	}

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
     * Composes a CREATE TABLE query from descrete inputs
     * 
     * @param Object            createSpec
     * @param Object            params
     * 
     * @return Savepoint
     */
    async createTable(createSpec, params = {}) {
        if (typeof createSpec?.name !== 'string') throw new Error(`createTable() called with invalid arguments.`);
        // -- Compose an query from request
        const query = CreateStatement.fromJSON(this, { kind: 'TABLE', argument: createSpec });
        if (params.ifNotExists) query.withFlag('IF_NOT_EXISTS');
        return this.client.query(query, params);
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
        // -- Compose an query from request
        const schemaJson = await this.describeTable(tblName);
        if (!schemaJson) throw new Error(`Table "${ tblName }" does not exist.`);
        const schemaApi = TableSchema.fromJSON(this, schemaJson)?.keep(true, true);
        await callback(schemaApi);
        const query = schemaApi.getAlt().with({ resultSchema: schemaApi });
        if (!query.length) return;
        if (params.ifExists) query.withFlag('IF_EXISTS');
        return this.client.query(query, params);
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
        const query = DropStatement.fromJSON(this, { kind: 'TABLE', name: tblName });
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.cascade) query.withFlag('CASCADE');
        return this.client.query(query, params);
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
	
	/**
	 * -------------------------------
	 */

    /**
     * Base logic for describeTable()
     * 
     * @param Function          callback
     * @param String|Array      tblName_s
     * 
     * @return Object
     */
    async describeTableCallback(callback, tblName_s) {
        const tblNames = [].concat(tblName_s);
        const isSingle = tblNames.length === 1 && tblNames[0] !== '*';
        const isAll = tblNames.length === 1 && tblNames[0] === '*';
        const $schemas = await callback(tblNames, isAll);
        const allTables = await this.tables();
        const schemas = (isAll ? allTables : tblNames).reduce((list, tblName) => {
            let $tblName = tblName.toLowerCase(), $schema = $schemas.find(schema => schema.name === $tblName);
            if (!$schema && (isAll || allTables.includes($tblName))) {
                $schema = { name: $tblName, columns: [], constraints: [], indexes: [] };
            }
            return list.concat($schema || []);
        }, []);
        return isSingle ? schemas[0] : schemas;
    }
}