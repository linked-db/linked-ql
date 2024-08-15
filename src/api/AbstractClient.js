
import Parser from '../lang/Parser.js';
import AbstractNode from '../lang/AbstractNode.js';
import Identifier from '../lang/components/Identifier.js';
import TableSchema from '../lang/schema/tbl/TableSchema.js';
import DatabaseSchema from '../lang/schema/db/DatabaseSchema.js';
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import AlterStatement from '../lang/ddl/alter/AlterStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import Savepoint from './Savepoint.js';

export default class AbstractClient {

    /**
     * @property String
     */
    static get OBJ_INFOSCHEMA_DB() { return 'obj_information_schema'; }
    
    /**
     * @constructor
     */
    constructor(driver, params = {}) {
        Object.defineProperty(this, '$', { value: { driver, params }});
    }

    /**
     * @property Driver
     */
    get driver() { return this.$.driver; }

    /**
     * @property Object
     */
    get params() { return this.$.params; }
    
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
		if (request === 'get:api:client') return this;
		if (request === 'get:client:kind') return this.constructor.kind;
	}

    /**
     * Returns a database instance.
     * 
     * @param String            name
     * @param Object            params
     * 
     * @return Database
     */
    database(name, params = {}) {
        return new this.constructor.Database(this, ...arguments);
    }

    /**
     * Returns all available databases.
     * 
     * @return Array
     */
    async databases() { return []; }

    /**
     * Tells whether a database exists.
     * 
     * @param String            name
     * 
     * @return Bool
     */
    async hasDatabase(name) {
        return (await this.databases()).includes(name);
    }

    /**
     * Composes a CREATE DATABASE query from descrete inputs
     * 
     * @param String|Object  createSpec
     * @param Object         params
     * 
     * @return Savepoint
     */
    async createDatabase(createSpec, params = {}) {
        if (typeof createSpec === 'string') { createSpec = { name: createSpec }; }
        else if (typeof createSpec?.name !== 'string') throw new Error(`createDatabase() called with invalid arguments.`);
        // -- Compose an query from request
        const query = CreateStatement.fromJSON(this, { kind: 'SCHEMA', argument: createSpec });
        if (params.ifNotExists) query.withFlag('IF_NOT_EXISTS');
        return await this.query(query, params);
    }

    /**
     * Composes an ALTER DATABASE query from descrete inputs
     * 
     * @param String|Object   alterSpec
     * @param Function        callback
     * @param Object          params
     * 
     * @return Savepoint
     */
    async alterDatabase(alterSpec, callback, params = {}) {
        if (typeof callback !== 'function') throw new Error(`alterDatabase() called with invalid arguments.`);
        if (typeof alterSpec === 'string') { alterSpec = { name: alterSpec }; }
        else if (typeof alterSpec?.name !== 'string') throw new Error(`alterDatabase() called with invalid arguments.`);
        // -- Compose an altInstance from request
        const schemaJson = await this.describeDatabase(alterSpec.name, alterSpec.tables);
        if (!schemaJson) throw new Error(`Database "${ alterSpec.name }" does not exist.`);
        const schemaApi = DatabaseSchema.fromJSON(this, schemaJson)?.keep(true, true);
        await callback(schemaApi);
        const query = schemaApi.getAlt().with({ resultSchema: schemaApi });
        if (!query.length) return;
        return await this.query(query, params);
    }

    /**
     * Composes a DROP DATABASE query from descrete inputs
     * 
     * @param String            dbName
     * @param Object            params
     * 
     * @return Savepoint
     */
    async dropDatabase(dbName, params = {}) {
        if (typeof dbName !== 'string') throw new Error(`dropDatabase() called with an invalid name: ${ dbName }.`);
        // -- Compose an dropInstamce from request
        const query = DropStatement.fromJSON(this, { kind: 'SCHEMA', name: dbName });
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.cascade) query.withFlag('CASCADE');
        return await this.query(query, params);
    }
    
    /**
     * Returns a JSON representation of a database and its tables.
     * 
     * @param String name
     * @param String|Array table_s
     * 
     * @return Object
     */
    async describeDatabase(name, table_s = ['*']) {
        return this.describeDatabaseCallback(async (dbName, table_s) => {
            const tables = table_s && await this.database(dbName).describeTable(table_s) || [];
            return { name: dbName, tables, };
        }, ...arguments);
    }
	
	/**
	 * -------------------------------
	 */

    /**
     * Base logic for describeTable()
     * 
     * @param Function          callback
     * @param String|Array      dbName_s
     * 
     * @return Object
     */
    async describeDatabaseCallback(callback, dbName_s, tables = ['*']) {
        let requestList;
        if (typeof dbName_s === 'string') requestList = [{ name: dbName_s, tables }];
        else if (Array.isArray(dbName_s)) requestList = dbName_s.map(entry => typeof entry === 'object' ? entry : { name: entry });
        else requestList = [].concat(dbName_s);
        const isSingle = requestList.length === 1 && requestList[0].name !== '*';
        const isAll = requestList.length === 1 && requestList[0].name === '*';
        const allDatabases = await this.databases();
        const schemas = await Promise.all(allDatabases.map(dbName => {
            const request = isAll ? { name: dbName, tables: requestList[0].tables } : requestList.find(request => request.name.toLowerCase() === dbName.toLowerCase());
            return request && callback(request.name, request.tables);
        }).filter(s => s));
        return isSingle ? schemas[0] : schemas;
    }

    /**
     * Base logic for dropDatabase()
     * 
     * @param Function                  handler
     * @param String                    query
     * @param Object                    params
     * 
     * @return Object
     */
    async queryCallback(handler, query, params = {}) {
        if (typeof query === 'string') query = Parser.parse(this, query, null, { log: params.log });
        else if (!(query instanceof AbstractNode)) throw new Error(`query() called with invalid arguments.`);
        // -- Generate resultSchema for Alter Database and Drop Database? We'll need it for savepoint creation or per driver's request for it (params.$resultSchema === 'always')
        const scope = {};
        const resultSchemaRequired = dbName => dbName && !(new RegExp(dbName, 'i')).test(this.constructor.OBJ_INFOSCHEMA_DB) && (!params.noCreateSavepoint || params.$resultSchema === 'always');
        const instanceOf = (o, classes) => classes.some(c => o instanceof c);
        if (instanceOf(query, [CreateStatement,AlterStatement,DropStatement])) {
            const tblName = query.KIND === 'TABLE' && query.$trace('get:name:table');
            const basename = query.$trace('get:name:database') || (query.KIND === 'TABLE' && await this.basenameGet(tblName, true));
            if (['DATABASE', 'SCHEMA'].includes(query.KIND) && resultSchemaRequired(basename)) {
                if (query instanceof DropStatement) {
                    const schemaApi = DatabaseSchema.fromJSON(this, await this.describeDatabase(basename)).drop();
                    query.with({ resultSchema: schemaApi });
                } else if (query instanceof AlterStatement && !query.resultSchema) {
                    const tablesList = query.ACTIONS.map(x => (x.CLAUSE === 'MODIFY' ? x.ARGUMENT.$trace('get:name:table') : (x.CLAUSE === 'DROP' ? x.name() : null))).filter(x => x);
                    const schemaApi = DatabaseSchema.fromJSON(this, await this.describeDatabase(basename, tablesList)).keep(true, true).alterWith(query); // Simulate edits;
                    query.with({ resultSchema: schemaApi });
                } else if (query instanceof CreateStatement) query.with({ resultSchema: query.ARGUMENT });
                // -- And that's what we'll use as snapshot
                scope.savepoint = query.resultSchema;
            } else if (query.KIND === 'TABLE' && resultSchemaRequired(basename)) {
                const dbApi = this.database(basename);
                if (query instanceof DropStatement && basename) {
                    const schemaApi = TableSchema.fromJSON(dbApi, await dbApi.describeTable(tblName)).drop();
                    query.with({ resultSchema: schemaApi });
                } else if (query instanceof AlterStatement && !query.resultSchema && basename) {
                    const schemaApi = TableSchema.fromJSON(dbApi, await dbApi.describeTable(tblName)).keep(true, true).alterWith(query); // Simulate edits;
                    query.with({ resultSchema: schemaApi });
                } else if (query instanceof CreateStatement && basename) query.with({ resultSchema: query.ARGUMENT });
                // -- But this is what we'll use as snapshot
                if (!params.noCreateSavepoint && basename) {
                    scope.savepoint = DatabaseSchema.fromJSON(this, {
                        name: dbApi.name,
                        tables: [query.resultSchema]
                    }).keep(true);
                }
            }
        }
        // -- Execute...
        const returnValue = await handler(query, params);
        // -- Generate savepoint?
        if (!params.noCreateSavepoint && scope.savepoint) {
            scope.savepoint.keep(scope.savepoint.keep(), 'auto');
            return await this.createSavepoint(scope.savepoint, params.description);
        }
        return returnValue;
    }

    /**
     * Sets or returns the search path for resolving unqualified table references.
     * 
     * @param Array|String resolutionPath
     * 
     * @return Array
     */
    async basenameResolution(resolutionPath = []) {
        if (arguments.length) { return (this.$.resolutionPath = [].concat(resolutionPath), this); }
        return new BasenameResolutor(this.$.basenameResolution);
    }

    /**
     * Resolving unqualified table reference.
     * 
     * @param String tblName
     * @param Bool withDefaultBasename
     * 
     * @returns String
     */
    async basenameGet(tblName, withDefaultBasename = false) {
        const basenames = await this.basenameResolution();
        return (await basenames.reduce(async (prev, dbName) => (await prev) || (await this.database(dbName).hasTable(tblName)) ? dbName : null, null))
        || (withDefaultBasename ? basenames.find(s => !s.startsWith('$')) || basenames[0] : null);
    }

    /**
	 * Returns all databases' current savepoint.
	 * 
     * @param Object params
	 * 
	 * @returns Object
     */
    async getSavepoints(params = {}) {
        const OBJ_INFOSCHEMA_DB = this.constructor.OBJ_INFOSCHEMA_DB;
        if (!(await this.hasDatabase(OBJ_INFOSCHEMA_DB))) return [];
        const tblName = [OBJ_INFOSCHEMA_DB,'database_savepoints'].join('.');
        const result = await this.query(`
            SELECT id, database_tag, name, ${ Identifier.fromJSON(this, '$name') }, keep, version_tag, version_max, CONCAT(rank_for_cursor, '/', total) AS ${ Identifier.fromJSON(this, '$cursor') }, savepoint_description, tables, savepoint_date, rollback_date FROM (
                SELECT *,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY rollback_date IS NOT NULL ${ params.direction === 'forward' ? 'DESC' : 'ASC' }, version_tag ${ params.direction === 'forward' ? 'ASC' : 'DESC' }) AS rank_for_target,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY version_tag ASC) AS rank_for_cursor,
                MAX(version_tag) OVER (PARTITION BY database_tag) AS version_max,
                COUNT(version_tag) OVER (PARTITION BY database_tag) AS total
                FROM ${ tblName }
            ) AS savepoint WHERE rollback_date IS ${ params.direction === 'forward' ? 'NOT NULL' : 'NULL' } AND rank_for_target = 1${ params.name ? (params.direction === 'forward' ? ` AND name = '${ params.name }'` : ` AND COALESCE(${ Identifier.fromJSON(this, '$name') }, name) = '${ params.name }'`) : '' }
        `);
        return result.map(savepoint => new Savepoint(this, savepoint, params.direction))
    }

    /**
     * Method for saving snapshots to internal OBJ_INFOSCHEMA db.
     * 
     * @param DatabaseSchema    schemaApi
     * @param String            description
     * 
     * @return Object
     */
    async createSavepoint(schemaApi, description = null) {
        // -- Create schema?
        const OBJ_INFOSCHEMA_DB = this.constructor.OBJ_INFOSCHEMA_DB;
        if (!(await this.hasDatabase(OBJ_INFOSCHEMA_DB))) {
            await this.createDatabase({
                name: OBJ_INFOSCHEMA_DB,
                tables: [{
                    name: 'database_savepoints',
                    columns: [
                        { name: 'id', ...(this.params.dialect === 'mysql' ? { type: 'char(36)', default: { expr: 'uuid()' } } : { type: 'uuid', default: { expr: 'gen_random_uuid()' } }), primaryKey: true },
                        // Actual snapshot
                        { name: 'name', type: ['varchar',255], notNull: true },
                        { name: '$name', type: ['varchar',255] },
                        { name: 'tables', type: 'json' },
                        { name: 'keep', type: this.params.dialect === 'mysql' ? ['bit',1] : 'boolean' },
                        // Meta data
                        { name: 'savepoint_description', type: ['varchar', 255] },
                        { name: 'database_tag', type: ['varchar', 12], notNull: true },
                        { name: 'version_tag', type: 'int', notNull: true },
                        { name: 'savepoint_date', type: ['timestamp',3], notNull: true },
                        { name: 'rollback_date', type: ['timestamp',3] },
                    ],
                }],
            }, { noCreateSavepoint: true });
        }
        // -- Savepoint JSON
        const { name, $name, ...rest } = schemaApi.toJSON();
        const savepointJson = {
            name, $name,
            database_tag: null,
            ...rest,
            version_tag: null,
            savepoint_description: description,
            savepoint_date: new Date,
        };
        // -- Find a match first. We're doing forward first to be able to restart an entire history that has been rolled all the way back
        const dbName = schemaApi.NAME/* IMPORTANT */;
        const currentSavepoint = (await this.database(dbName).savepoint({ direction: 'forward' })) || await this.database(dbName).savepoint();
        if (currentSavepoint) {
            const tblName = [OBJ_INFOSCHEMA_DB,'database_savepoints'].join('.');
            // -- Apply id and tag from lookup
            savepointJson.database_tag = currentSavepoint.databaseTag;
            savepointJson.version_tag = currentSavepoint.versionMax + 1;
            // -- Delete all forward records
            if (currentSavepoint.direction === 'forward') {
                await this.query(`DELETE FROM ${ tblName } WHERE database_tag = '${ currentSavepoint.databaseTag }' AND rollback_date IS NOT NULL`);
            } else { savepointJson.version_tag = currentSavepoint.versionTag + 1; }
        } else {
            // -- Generate tag and version as fresh
            savepointJson.database_tag = `db:${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }`;
            savepointJson.version_tag = 1;
        }
        // -- Create record
        const insertResult = await this.database(OBJ_INFOSCHEMA_DB).table('database_savepoints').insert(savepointJson, { returning: '*' });
        return new Savepoint(this, { ...insertResult, version_max: savepointJson.version_tag, $cursor: null });
    }
}