
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import Identifier from '../lang/components/Identifier.js';

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
     * @property Identifier
     */
	get ident() { return Identifier.fromJSON(this, this.name); }

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
	 * Performs any initialization work.
     */
	async $init() { await this.client.$init(); }

    /**
	 * Returns the database's current savepoint.
	 * 
     * @param Object params
	 * 
	 * @returns Object
     */
    async savepoint(selector = {}) { return (await this.client.savepoints({ ...selector, name: this.name }))[0]; }

    /**
	 * Returns the database's schema.
	 * 
     * @param Array     tblSelector
	 * 
	 * @returns DatabaseSchema
     */
    async schema(tblSelector = ['*']) { return (await this.client.schemas({ [ this.name ]: tblSelector })).database(this.name); }
	
    /**
     * Returns list of tables.
     * 
     * @return Array
     */
    async tables() { return await this.tablesCallback(() => []); }

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
     * Tells whether a table exists.
     * 
     * @param String            name
     * 
     * @return Bool
     */
    async hasTable(name) {
        await this.$init();
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
        await this.$init();
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
        await this.$init();
        if (typeof callback !== 'function' || typeof tblName !== 'string') throw new Error(`alterTable() called with invalid arguments.`);
        // -- Compose an query from request
        const schemaApi = (await this.table(tblName).schema())?.keep(true, true);
        if (!schemaApi) throw new Error(`Table "${ tblName }" does not exist.`);
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
        await this.$init();
        if (typeof tblName !== 'string') throw new Error(`dropTable() called with invalid arguments.`);
        // -- Compose an dropInstamce from request
        const query = DropStatement.fromJSON(this, { kind: 'TABLE', name: tblName });
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.cascade) query.withFlag('CASCADE');
        return this.client.query(query, params);
    }
	
	/**
	 * -------------------------------
	 */

    /**
     * Base logic for tables()
     * 
     * @param Function          callback
     * 
     * @return Array
     */
    async tablesCallback(callback) {
        await this.$init();
        return await callback();
    }
}