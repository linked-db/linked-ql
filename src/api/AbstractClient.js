
import { _isObject } from '@webqit/util/js/index.js';
import { _intersect } from '@webqit/util/arr/index.js';
import Parser from '../lang/Parser.js';
import AbstractNode from '../lang/AbstractNode.js';
import Identifier from '../lang/components/Identifier.js';
import DatabaseSchema from '../lang/schema/db/DatabaseSchema.js';
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import AlterStatement from '../lang/ddl/alter/AlterStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import RootSchema from '../lang/schema/RootSchema.js';
import Savepoint from './Savepoint.js';

export default class AbstractClient {

    /**
     * @property String
     */
    static CONST = Object.freeze({
        LINKED_DB: Object.freeze({
            name: ['linked_db','obj_information_schema'],
            savepointsTable: ['savepoints','database_savepoints'],
        }),
    });
    
    /**
     * @constructor
     */
    constructor(init = {}) {
        Object.defineProperty(this, '$', { value: init });
    }

    /**
     * @property Object
     */
    get params() { return this.$.params || {}; }

	/**
	 * Performs any initialization work.
     */
	async $init() {
        if (this.$.initialised) return;
        this.$.initialised = true;
        if (this.params.nameResolution) await this.nameResolution(this.params.nameResolution);
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
     * Tells whether a database exists.
     * 
     * @param String            name
     * 
     * @return Bool
     */
    async hasDatabase(name) {
        await this.$init();
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
        await this.$init();
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
        await this.$init();
        // -- Compose an altInstance from request
        const dbSchema = (await this.structure([{ name: alterSpec.name, tables: alterSpec.tables }])).database(alterSpec.name);
        if (!dbSchema) throw new Error(`Database "${ alterSpec.name }" does not exist.`);
        await callback(dbSchema.keep(true, true));
        const query = dbSchema.getAlt().with({ resultSchema: dbSchema });
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
        await this.$init();
        // -- Compose an dropInstamce from request
        const query = DropStatement.fromJSON(this, { kind: 'SCHEMA', ident: dbName });
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.cascade) query.withFlag('CASCADE');
        return await this.query(query, params);
    }

    /**
     * Method for saving snapshots to internal OBJ_INFOSCHEMA db.
     * 
     * @param DatabaseSchema    dbSchema
     * @param String            description
     * 
     * @return Object
     */
    async createSavepoint(dbSchema, details = null) {
        const linkedDB = await this.linkedDB(true);
        const savepointsTable = linkedDB.savepointsTable();
        // -- Savepoint JSON
        const { name, $name, ...rest } = dbSchema.toJSON();
        const savepointJson = {
            name, $name,
            database_tag: null,
            ...rest,
            version_tag: null,
            savepoint_date: new Date,
            savepoint_description: details.description,
            savepoint_ref: details.reference,
        };
        // -- Find a match first. We're doing forward first to be able to restart an entire history that has been rolled all the way back
        const dbName = dbSchema.NAME/* IMPORTANT */;
        const currentSavepoint = (await this.database(dbName).savepoint({ direction: 'forward' })) || await this.database(dbName).savepoint();
        if (currentSavepoint) {
            // -- Apply id and tag from lookup
            savepointJson.database_tag = currentSavepoint.databaseTag;
            savepointJson.version_tag = currentSavepoint.versionMax + 1;
            // -- Delete all forward records
            if (currentSavepoint.direction === 'forward') {
                await savepointsTable.delete(q => q.where(
                    q => q.equals('database_tag', q => q.value(currentSavepoint.databaseTag)),
                    q => q.isNotNull('rollback_date'),
                ));
            } else { savepointJson.version_tag = currentSavepoint.versionTag + 1; }
        } else {
            // -- Generate tag and version as fresh
            savepointJson.database_tag = `db:${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }`;
            savepointJson.version_tag = 1;
        }
        // -- Create record
        const insertResult = await savepointsTable.insert(savepointJson, { returning: '*' });
        return new Savepoint(this, { ...insertResult, version_max: savepointJson.version_tag, $cursor: null });
    }
    
    /**
	 * Returns all databases' current savepoint.
	 * 
     * @param Object selector
	 * 
	 * @returns Object
     */
    async savepoints(selector = {}) {
        const linkedDB = await this.linkedDB();
        const savepointsTable = linkedDB && linkedDB.savepointsTable();
        if (!savepointsTable) return [];
        const result = await this.query(`
            SELECT id, database_tag, name, ${ Identifier.fromJSON(this, '$name') }, keep, version_tag, version_max, CONCAT(rank_for_cursor, '/', total) AS ${ Identifier.fromJSON(this, '$cursor') }, tables, savepoint_date, savepoint_description, savepoint_ref, rollback_date, rollback_description, rollback_ref FROM (
                SELECT *,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY rollback_date IS NOT NULL ${ selector.direction === 'forward' ? 'DESC' : 'ASC' }, version_tag ${ selector.direction === 'forward' ? 'ASC' : 'DESC' }) AS rank_for_target,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY version_tag ASC) AS rank_for_cursor,
                MAX(version_tag) OVER (PARTITION BY database_tag) AS version_max,
                COUNT(version_tag) OVER (PARTITION BY database_tag) AS total
                FROM ${ savepointsTable.ident }
            ) AS savepoint WHERE rollback_date IS ${ selector.direction === 'forward' ? 'NOT NULL' : 'NULL' } AND rank_for_target = 1${ selector.name ? (selector.direction === 'forward' ? ` AND name = '${ selector.name }'` : ` AND COALESCE(${ Identifier.fromJSON(this, '$name') }, name) = '${ selector.name }'`) : '' }
        `);
        return result.map(savepoint => new Savepoint(this, savepoint, selector.direction));
    }
	
	/**
	 * -------------------------------
	 */

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
        await this.$init();
        // -- Let's be clear from the start the target objects
        const tblName = query.$trace('get:TABLE_NAME');
        const dbName = query.$trace('get:DATABASE_NAME') || tblName && (await query.$trace('get:ROOT_SCHEMA')).findPath(tblName, query instanceof CreateStatement);
        const target = Identifier.fromJSON(this, tblName ? [ dbName, tblName ] : [ dbName ]);
        // -- Generate resultSchema for Alter Database and Drop Database? We'll need it for savepoint creation or per driver's request for it (params.$resultSchema === 'always')
        const scope = {};
        // -- DDL?
        const shouldCreateSavepoint = dbName && !(new RegExp(dbName, 'i')).test(this.constructor.CONST.LINKED_DB.name[0]) && !params.noCreateSavepoint;
        if ([CreateStatement,AlterStatement,DropStatement].some(c => query instanceof c) && shouldCreateSavepoint) {
            // -- Database DDL
            if (['DATABASE', 'SCHEMA'].includes(query.KIND)) {
                if (query instanceof DropStatement) {
                    const dbSchema = (await query.$trace('get:ROOT_SCHEMA')).database(dbName)?.clone().keep(false); // May be an "IF EXISTS" operation and may actually not exists
                    query.with({ resultSchema: dbSchema });
                } else if (query instanceof AlterStatement && !query.resultSchema) {
                    const tablesList = query.ACTIONS.map(x => (x.CLAUSE === 'MODIFY' ? x.ARGUMENT.$trace('get:TABLE_NAME') : (x.CLAUSE === 'DROP' ? x.ident().name() : null))).filter(x => x);
                    const dbSchema = (await query.$trace('get:ROOT_SCHEMA')).database(dbName)?.clone();
                    if (tablesList.length) { dbSchema.TABLES = dbSchema.TABLES.filter(tbl => !tablesList.includes(tbl.name())); }
                    dbSchema.keep(true, true).alterWith(query); // Simulate edits;
                    query.with({ resultSchema: dbSchema });
                } else if (query instanceof CreateStatement) query.with({ resultSchema: query.ARGUMENT });
                // -- And that's what we'll use as snapshot
                scope.savepoint = query.resultSchema;
            } else if (query.KIND === 'TABLE') {
                if (query instanceof DropStatement) {
                    const dbSchema = (await query.$trace('get:ROOT_SCHEMA')).database(dbName)?.table(tblName)?.clone().keep(false); // May be an "IF EXISTS" operation and may actually not exists
                    query.with({ resultSchema: dbSchema });
                } else if (query instanceof AlterStatement && !query.resultSchema) {
                    const dbSchema = (await query.$trace('get:ROOT_SCHEMA')).database(dbName)?.table(tblName)?.clone().keep(true, true).alterWith(query); // Simulate edits;
                    query.with({ resultSchema: dbSchema });
                } else if (query instanceof CreateStatement) query.with({ resultSchema: query.ARGUMENT });
                // -- But this is what we'll use as snapshot
                scope.savepoint = query.resultSchema && DatabaseSchema.fromJSON(this, {
                    name: dbName,
                    tables: [ query.resultSchema ]
                }).keep(true);
            }
        }
        // -- Execute...
        const returnValue = await handler(target, query, params);
        // -- Generate savepoint?
        if (scope.savepoint) {
            scope.savepoint.keep(scope.savepoint.keep(), 'auto');
            return await this.createSavepoint(scope.savepoint, params);
        }
        return returnValue;
    }

    /**
     * Base logic for structure()
     * 
     * @param Function                  handler
     * @param Array|Object              selector
     * @param Bool                      construct
     * 
     * @return Object
     */
    async structureCallback(handler, selector = {}, construct = true) {
        const structure = await handler(selector);
        if (!construct) return structure;
        return RootSchema.fromJSON(this, structure);
    }

    /**
     * Sets or returns the search path for resolving unqualified table references.
     * 
     * @param Array|String searchPath
     * 
     * @return Array
     */
    async searchPath(resolutionPath = []) {
        if (arguments.length) { return (this.$.searchPath = [].concat(searchPath), this); }
        return this.$.searchPath || [];
    }

    /**
     * Returns an instance of the LINKED_DB database for internal stuff. Initializes it on first call.
     * 
     * @param Boolean            autoInit
     * 
     * @return Database
     */
    async linkedDB(autoInit = false) {
        const CONST = this.constructor.CONST;
        const linkedDB = this.database(CONST.LINKED_DB.name[0]);
        // -- Dynamic initialization
        if (!CONST.LINKED_DB.name.exists) {
            const rootSchema = await this.structure({ depth: 1, includeLinkedDB: true });
            // -- DB
            let foundDbName = rootSchema.databases().find(dbName => CONST.LINKED_DB.name.includes(dbName));
            if (!foundDbName && !autoInit) return;
            if (!foundDbName) await this.createDatabase(CONST.LINKED_DB.name[0], { noCreateSavepoint: true });
            else if (foundDbName !== CONST.LINKED_DB.name[0]) await this.alterDatabase(foundDbName, dbSchema => dbSchema.name(CONST.LINKED_DB.name[0]), { noCreateSavepoint: true });
            // -- TBLs
            let foundTblName = _intersect(rootSchema.database(foundDbName).tables(), CONST.LINKED_DB.savepointsTable)[0];
            if (!foundTblName) await linkedDB.createTable({
                name: CONST.LINKED_DB.savepointsTable[0],
                columns: [
                    { name: 'id', ...(this.params.dialect === 'mysql' ? { type: 'char(36)', default: { expr: 'uuid()' } } : { type: 'uuid', default: { expr: 'gen_random_uuid()' } }), primaryKey: true },
                    // Actual snapshot
                    { name: 'name', type: ['varchar',255], notNull: true },
                    { name: '$name', type: ['varchar',255] },
                    { name: 'tables', type: 'json' },
                    { name: 'keep', type: this.params.dialect === 'mysql' ? ['bit',1] : 'boolean' },
                    // Meta data
                    { name: 'database_tag', type: ['varchar', 12], notNull: true },
                    { name: 'version_tag', type: 'int', notNull: true },
                    { name: 'savepoint_date', type: ['timestamp',3], notNull: true },
                    { name: 'savepoint_description', type: ['varchar', 255] },
                    { name: 'savepoint_ref', type: ['varchar', 50] },
                    { name: 'rollback_date', type: ['timestamp',3] },
                    { name: 'rollback_description', type: ['varchar', 255] },
                    { name: 'rollback_ref', type: ['varchar', 50] },
                ]
            }, { noCreateSavepoint: true });
            else if (foundTblName !== CONST.LINKED_DB.savepointsTable[0]) await linkedDB.alterTable(foundTblName, tblSchema => tblSchema.name(CONST.LINKED_DB.savepointsTable[0]), { noCreateSavepoint: true });
            CONST.LINKED_DB.name.exists = true;
        }
        // -- Dynamic tables initialization
        Object.defineProperty(linkedDB, 'savepointsTable', { value: () => {
            return linkedDB.table(CONST.LINKED_DB.savepointsTable[0]);
        }});
        return linkedDB;
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
        if (request === 'get:CLIENT_API') return this;
        if (request === 'get:ROOT_SCHEMA') return this.structure({ depth: 2 });
    }
}