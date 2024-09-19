
import { _isObject } from '@webqit/util/js/index.js';
import { _from as _arrFrom, _difference, _intersect } from '@webqit/util/arr/index.js';
import Parser from '../lang/Parser.js';
import AbstractNode from '../lang/AbstractNode.js';
import Identifier from '../lang/components/Identifier.js';
import DatabaseSchema from '../lang/schema/db/DatabaseSchema.js';
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import AlterStatement from '../lang/ddl/alter/AlterStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import RootSchema from '../lang/schema/RootSchema.js';
import Savepoint from './Savepoint.js';
import InsertStatement from '../lang/dml/insert/InsertStatement.js';
import UpdateStatement from '../lang/dml/update/UpdateStatement.js';

export default class AbstractClient {
    
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
        return await this.structure({ depth: 2, inSearchPathOrder: true }, async () => {
            // -- Compose an altInstance from request
            const dbSchema = (await this.structure([{ name: alterSpec.name, tables: alterSpec.tables }])).database(alterSpec.name);
            if (!dbSchema) throw new Error(`Database "${ alterSpec.name }" does not exist.`);
            await callback(dbSchema.keep(true, true));
            const query = dbSchema.getAlt().with({ resultSchema: dbSchema });
            if (!query.length) return;
            return await this.query(query, params);
        });
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
        const linkedDB = await this.linkedDB();
        const savepointsTable = linkedDB.table('savepoints');
        // -- Savepoint JSON
        const { name, $name, ...rest } = dbSchema.toJSON();
        const savepointJson = {
            name, $name,
            database_tag: null,
            ...rest,
            version_tag: null,
            savepoint_date: q => q.fn('now'),
            savepoint_desc: details.desc,
            savepoint_ref: details.ref || this.params.commitRef,
            savepoint_pid: q => q.literal(this.params.dialect === 'mysql' ? 'connection_id()' : 'pg_backend_pid()'),
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
        const result = await this.query(`
            SELECT id, database_tag, name, ${ Identifier.fromJSON(this, '$name') }, keep, version_tag, version_max, CONCAT(rank_for_cursor, '/', total) AS ${ Identifier.fromJSON(this, '$cursor') }, tables, savepoint_date, savepoint_desc, savepoint_ref, rollback_date, rollback_desc, rollback_ref FROM (
                SELECT *,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY rollback_date IS NOT NULL ${ selector.direction === 'forward' ? 'DESC' : 'ASC' }, version_tag ${ selector.direction === 'forward' ? 'ASC' : 'DESC' }) AS rank_for_target,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY version_tag ASC) AS rank_for_cursor,
                MAX(version_tag) OVER (PARTITION BY database_tag) AS version_max,
                COUNT(version_tag) OVER (PARTITION BY database_tag) AS total
                FROM ${ linkedDB.table('savepoints').ident }
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
        const dbName = query.$trace('get:DATABASE_NAME'), tblName = query.$trace('get:TABLE_NAME');
        const willCreateSavepoint = [CreateStatement,AlterStatement,DropStatement].some(c => query instanceof c) && !params.noCreateSavepoint;
        const mightHaveDimensions = [InsertStatement,UpdateStatement].some(x => query instanceof x);
        const willNeedStructure = (tblName && !dbName) || willCreateSavepoint || mightHaveDimensions;
        return await this.structure(willNeedStructure && { depth: 2, inSearchPathOrder: true }, async rootSchema => {
            // -- Let's be clear from the start the target objects
            const scope = {}, target = Identifier.fromJSON(this, tblName ? [ dbName || rootSchema.findPath(tblName, query instanceof CreateStatement), tblName ] : [ dbName ]);
            // -- DDL?
            if (willCreateSavepoint) {
                // -- Database DDL
                if (['DATABASE', 'SCHEMA'].includes(query.KIND)) {
                    if (query instanceof DropStatement) {
                        const dbSchema = rootSchema.database(target.name())?.keep(false); // May be an "IF EXISTS" operation and may actually not exists
                        query.with({ resultSchema: dbSchema });
                    } else if (query instanceof AlterStatement && !query.resultSchema) {
                        const tablesList = query.ACTIONS.map(x => (x.CLAUSE === 'MODIFY' ? x.ARGUMENT.$trace('get:TABLE_NAME') : (x.CLAUSE === 'DROP' ? x.ident().name() : null))).filter(x => x);
                        const dbSchema = rootSchema.database(target.name());
                        if (tablesList.length) { dbSchema.TABLES = dbSchema.TABLES.filter(tbl => !tablesList.includes(tbl.name())); }
                        dbSchema.keep(true, true).alterWith(query); // Simulate edits;
                        query.with({ resultSchema: dbSchema });
                    } else if (query instanceof CreateStatement) query.with({ resultSchema: query.ARGUMENT });
                    // -- And that's what we'll use as snapshot
                    scope.savepoint = query.resultSchema;
                } else if (query.KIND === 'TABLE') {
                    if (query instanceof DropStatement) {
                        const dbSchema = rootSchema.database(target.prefix())?.table(tblName)?.keep(false); // May be an "IF EXISTS" operation and may actually not exists
                        query.with({ resultSchema: dbSchema });
                    } else if (query instanceof AlterStatement && !query.resultSchema) {
                        const dbSchema = rootSchema.database(target.prefix())?.table(tblName)?.keep(true, true).alterWith(query); // Simulate edits;
                        query.with({ resultSchema: dbSchema });
                    } else if (query instanceof CreateStatement) query.with({ resultSchema: query.ARGUMENT });
                    // -- But this is what we'll use as snapshot
                    scope.savepoint = query.resultSchema && DatabaseSchema.fromJSON(this, {
                        name: target.prefix(),
                        tables: [ query.resultSchema ]
                    }).keep(true);
                }
            } else {
                if (query.expandable) await query.expand(true);
                if (mightHaveDimensions) {
                    [ query, scope.preHook, scope.postHook ] = await query.resolveDimensions();
                    if (scope.preHook) await scope.preHook();
                }
            }
            // -- Execute...
            let returnValue = await handler(target, query, params);
            if (scope.postHook) returnValue = await scope.postHook(returnValue);
            // -- Generate savepoint?
            if (scope.savepoint) {
                scope.savepoint.keep(scope.savepoint.keep(), 'auto');
                return await this.createSavepoint(scope.savepoint, params);
            }
            return returnValue;
        });
    }

    /**
     * Base logic for structure()
     * 
     * @param Function                  handler
     * @param Array|Object              selector
     * @param Array                     ...rest
     * 
     * @return Object
     */
    structureMemoStack = new Set;
    async structureCallback(handler, selector = {}, ...rest) {
        const matchExistingRequest = exactMatching => [ ...this.structureMemoStack ].find(req => {
            if (_isObject(req.selector) && _isObject(selector)) {
                return Object.keys(selector).every(key => {
                    // If ongoing request has higher depth, current does't matter
                    return !exactMatching && key === 'depth' ? (req.selector[key] || 0) >= (selector[key] || 0) : (
                        // If ongoing request has inSearchPathOrder, current does't matter
                        key === 'inSearchPathOrder' ? req.selector[key] || !selector[key] : req.selector[key] === selector[key]
                    )
                });
            }
            if (Array.isArray(req.selector) && Array.isArray(selector)) {
                return selector.every(path2 => {
                    // If ongoing request already has the db name
                    return req.selector.find(path1 => path2.name === path1.name 
                        // If ongoing request has any of the tables mentioned in new request
                        && ((tbls2, tbls1) => exactMatching ? _intersect(tbls2, tbls1).length === tbls2.length : !_difference(tbls2, tbls1).length)(_arrFrom(path2.tables), _arrFrom(path1.tables)));
                });
            }
            if (_isObject(req.selector) && req.selector.depth && Array.isArray(selector)) {
                // See if it's up to table depth
                const tblDepth = selector.reduce((prev, s) => Math.max(prev, [].concat(s.tables || []).length), 0) ? 2 : 1;
                // Match depth
                return req.selector.depth >= tblDepth;
            }
        });
        const exactMatching = typeof rest[0] === 'boolean' ? rest.shift() : true;
        const callback = typeof rest[0] === 'function' ? rest.shift() : (result => result);
        if (!selector) return callback(); // IMPORTANT: structure() callers can do this for convenience
        const resultPromise = matchExistingRequest(exactMatching)?.resultPromise || handler(selector);
        const cachePayload = ($payload => (this.structureMemoStack.add($payload), $payload))({ selector, resultPromise });
        const resultSchema = ($resultSchema => !Array.isArray(selector) ? $resultSchema : $resultSchema.reduce((dbs, db) => {
            const ss = selector.find(ss => ss.name === db.name);
            const tablesList = [].concat(ss?.tables || []);
            if (tablesList.length && tablesList[0] !== '*') db = { ...db, tables: db.tables.filter(tbl => tablesList.includes(tbl.name)) };
            return dbs.concat(ss && db || []);
        }, []))(await resultPromise);
        const returnValue = await callback(RootSchema.fromJSON(this, resultSchema));
        this.structureMemoStack.delete(cachePayload);
        // Return value
        return returnValue;
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
     * Returns LinkedDB DB instance; does setup work where necessary.
     * 
     * @return Database
     */
    async linkedDB() {
        const migrations = [
            // --v1: create base structure
            async (dbName) => {
                await this.createDatabase({
                    name: dbName,
                    tables: [{
                        name: 'savepoints',
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
                            { name: 'savepoint_desc', type: ['varchar', 255] },
                            { name: 'savepoint_ref', type: ['varchar', 50] },
                            { name: 'savepoint_pid', type: ['varchar', 50] },
                            { name: 'rollback_date', type: ['timestamp',3] },
                            { name: 'rollback_desc', type: ['varchar', 255] },
                            { name: 'rollback_ref', type: ['varchar', 50] },
                            { name: 'rollback_pid', type: ['varchar', 50] },
                        ],
                    }],
                }, { noCreateSavepoint: true });
                if (this.params.dialect === 'postgres') {
                    await this.driver.query(`
                        -- The Function
                        CREATE OR REPLACE FUNCTION fire_savepoints_event() RETURNS trigger AS $$
                        BEGIN
                            PERFORM pg_notify('savepoints_stream', json_build_object(
                                'action', TG_OP,
                                'entry', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
                            )::text);
                            RETURN NEW;
                        END;
                        $$ LANGUAGE plpgsql;
                        -- The trigger
                        DROP TRIGGER IF EXISTS savepoints_event_trigger ON "${ dbName }"."savepoints";
                        CREATE TRIGGER savepoints_event_trigger
                            AFTER INSERT OR UPDATE OR DELETE ON "${ dbName }"."savepoints"
                            FOR EACH ROW EXECUTE FUNCTION fire_savepoints_event();
                    `);
                }
            },
        ];
        // -- Initialise
        const peakVersion = migrations.length;
        const baseName = (v) => 'linked_db'+(v&&`_v${v}`||'');
        const instance = this.database(baseName(peakVersion));
        Object.defineProperty(instance, 'uninstall', { value: async (cascade) => {
            await this.dropDatabase(instance.name, { cascade, noCreateSavepoint: true });
        }});
        if (this.installed) return instance;
        this.installed = true;
        // -- Install or upgrade
        const rootSchema = await this.structure({ depth: 1 });
        const foundName = rootSchema.databases().find(dbName => dbName.startsWith(baseName()) || dbName === 'obj_information_schema');
        const foundVersion = foundName && /^.+?([\d]+)$/.exec(foundName)?.[1] || -1;
        if (foundName && foundVersion === -1) console.warn(`Your database has a old version of Linked DB that is no longer supported. Any savepoint record in there will be retained but won't be migrated to the new Linked DB version you have now. You may file an issue on github for any assistance.`);
        if (peakVersion < foundVersion) throw new Error(`Your database has a higher version of Linked DB "${ foundVersion }" than this query client is designed to support "${ peakVersion }". Consider upgrading this client to latest version.`);
        for (let i = 1; i <= migrations.length; i ++) {
            if (i <= foundVersion) continue;
            const fromName = baseName(i-1), toName = baseName(i);
            try {
                this.structureMemoStack.clear();
                if (i>1) await this.alterDatabase(fromName, dbSchema => dbSchema.name(toName), { noCreateSavepoint: true });
                await migrations[i-1](toName);
            } catch(e) { throw new Error(`Error upgrading your Linked DB version from ${ fromName } to ${ toName }. Consider filing an issue on github. (${ e })`); }
        }
        return instance;
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