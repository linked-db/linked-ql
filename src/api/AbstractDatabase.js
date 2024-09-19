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
    async structure(tblSelector = ['*']) { return (await this.client.structure([{ name: this.name, tables: tblSelector }])).database(this.name); }

    /**
     * Returns a table instance.
     * 
     * @param String            name
     * @param Object            params
     * 
     * @return Table
     */
    table(name, params = {}) { return new this.constructor.Table(this, ...arguments); }

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
        return await this.client.structure({ depth: 2, inSearchPathOrder: true }, async () => {
            // -- Compose an query from request
            const tblSchema = (await this.table(tblName).structure())?.keep(true, true);
            if (!tblSchema) throw new Error(`Table "${ tblName }" does not exist.`);
            await callback(tblSchema);
            const query = tblSchema.getAlt().with({ resultSchema: tblSchema });
            if (!query.length) return;
            if (params.ifExists) query.withFlag('IF_EXISTS');
            return this.client.query(query, params);
        });
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
        const query = DropStatement.fromJSON(this, { kind: 'TABLE', ident: tblName });
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.cascade) query.withFlag('CASCADE');
        return this.client.query(query, params);
    }
    
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
		if (request === 'get:DATABASE_API') return this;
		if (request === 'get:DATABASE_NAME') return this.name;
        return this.client.$trace(request, ...args);
	}
}