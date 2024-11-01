import { AlterTable } from '../lang/ddl/database/actions/AlterTable.js';
import { CreateTable } from '../lang/ddl/database/actions/CreateTable.js';
import { DropTable } from '../lang/ddl/database/actions/DropTable.js';
import { RenameTable } from '../lang/ddl/database/actions/RenameTable.js';
import { GlobalDatabaseRef } from '../lang/expr/refs/GlobalDatabaseRef.js';

export class AbstractDatabase {

    /**
     * @constructor
     */
    constructor(client, dbName, params = {}) {
        Object.defineProperty(this, '$', { value: { client, name: dbName, params } });
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
     * @property GlobalDatabaseRef
     */
    get ident() { return GlobalDatabaseRef.fromJSON(this, this.name); }

    /**
     * @property Object
     */
    get params() { return Object.assign({}, this.client.params, this.$.params); }

    /**
     * Returns the database's current savepoint.
     * 
     * @param Object params
     * 
     * @returns Object
     */
    async savepoint(params = {}) { return (await this.client.getSavepoints({ ...params, selector: this.name }))[0]; }

    /**
     * Returns the database's schema.
     * 
     * @param Array     tblSelector
     * 
     * @returns DatabaseSchema
     */
    async schema(tblSelector = ['*']) { return (await this.client.schema([{ name: this.name, tables: tblSelector }])).database(this.name); }

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
        const query = CreateTable.fromJSON(this, { argument: createSpec });
        query.argument().prefix(this.name);
        if (params.ifNotExists) query.withFlag('IF_NOT_EXISTS');
        return this.client.query(query, params);
    }

    /**
     * Composes a DROP DATABASE query from descrete inputs
     * 
     * @param String            tblName
     * @param String            tblToName
     * @param Object            params
     * 
     * @return Savepoint
     */
    async renameTable(tblName, tblToName, params = {}) {
        const query = RenameTable.fromJSON(this, { reference: tblName, argument: tblToName });
        if (!query) throw new Error(`renameTable() called with an invalid arguments.`);
        query.reference().prefix(this.name);
        return await this.client.query(query, params);
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
        if (typeof callback !== 'function') throw new Error(`alterTable() called with invalid arguments.`);
        return await this.client.withSchema(async () => {
            // -- Compose an query from request
            const tblSchema = await this.table(tblName).schema();
            if (!tblSchema) throw new Error(`Table "${tblName}" does not exist.`);
            const tblSchemaEditable = tblSchema.clone();
            await callback(tblSchemaEditable.$nameLock(true));
            const tableCDL = tblSchema.diffWith(tblSchemaEditable).generateCDL({ cascade: params.cascade });
            if (!tableCDL.length) return;
            const query = AlterTable.fromJSON(this, { reference: tblSchema.name(), argument: tableCDL });
            query.reference().prefix(this.name);
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
        const query = DropTable.fromJSON(this, { reference: tblName });
        if (!query) throw new Error(`dropTable() called with an invalid arguments.`);
        query.reference().prefix(this.name);
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.cascade) query.withFlag('CASCADE');
        return this.client.query(query, params);
    }

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
     * Returns list of tables.
     * 
     * @return Array
     */
    async tables() {
        return (await this.schema()).tables(false);
    }

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
     * A generic method for tracing something up the node tree.
     * Like a context API.
     * 
     * @param String request
     * @param Array ...args
     * 
     * @returns any
     */
    $capture(requestName, requestSource) {
        return this.client.$capture(requestName, requestSource);
    }
}