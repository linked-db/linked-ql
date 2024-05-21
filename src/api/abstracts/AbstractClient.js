
import { _isObject } from '@webqit/util/js/index.js';
import CreateDatabase from '../../query/create/CreateDatabase.js';
import AlterDatabase from '../../query/alter/AlterDatabase.js';
import DropDatabase from '../../query/drop/DropDatabase.js';
import CreateTable from '../../query/create/CreateTable.js';
import AlterTable from '../../query/alter/AlterTable.js';
import DropTable from '../../query/drop/DropTable.js';
import Select from '../../query/select/Select.js';
import Insert from '../../query/insert/Insert.js';
import Update from '../../query/update/Update.js';
import Delete from '../../query/delete/Delete.js';
import Parser from '../../query/Parser.js';
import Savepoint from './Savepoint.js';

const objInternals = {
    infoSchemaDB: 'obj_information_schema',
    instances: new Set,
    schemas: new Map,
};
export default class AbstractClient {
    
    /**
     * @constructor
     */
    constructor(driver, params = {}) {
        if (!this.constructor.kind) throw new Error(`Subclasses of Objective SQL Client must implement a static "kind" property.`);
        if (!objInternals.schemas.has(this.constructor.kind)) { objInternals.schemas.set(this.constructor.kind, new Map); }
        objInternals.instances.add(this);
        Object.defineProperty(this, '$', { value: {
            driver,
            schemas: objInternals.schemas.get(this.constructor.kind),
            params, 
        }});
    }

    /**
     * @property String
     */
    static get OBJ_INFOSCHEMA_DB() { return objInternals.infoSchemaDB; }

    /**
     * @property Driver
     */
    get driver() { return this.$.driver; }

    /**
     * @property Object
     */
    get params() { return this.$.params; }

    /**
     * Sets or returns default database.
     * 
     * @param Array            args
     * 
     * @return String
     */
    async searchPath(...args) { return this.searchPathCallback(() => {}, ...arguments); }

    /**
     * Returns list of databases.
     * 
     * @param Object            params
     * 
     * @return Array
     */
    async databases(params = {}) { return this.databasesCallback(() => ([]), ...arguments); }

    /**
     * Creates a database.
     * 
     * @param String            dbName
     * @param Object            params
     * 
     * @return Bool
     */
    async createDatabase(dbName, params = {}) { return this.createDatabaseCallback(...arguments); }

    /**
     * Forwards to: createDatabase().
     * @with: params.ifNotExixts = true
     */
    async createDatabaseIfNotExists(dbName, params = {}) { return this.createDatabase(dbName,  { ...params, ifNotExists: true }); }

    /**
     * Returns a database instance.
     * 
     * @param String            dbName
     * @param Function          editCallback
     * @param Object            params
     * 
     * @return Bool
     */
    async alterDatabase(dbName, editCallback, params = {}) { return this.alterDatabaseCallback(...arguments); }

    /**
     * Drops a database.
     * 
     * @param String            dbName
     * @param Object            params
     * 
     * @return Bool
     */
    async dropDatabase(dbName, params = {}) { return this.dropDatabaseCallback(...arguments); }

    /**
     * @forwardsTo: dropDatabase().
     * @with: params.ifExixts = true
     */
    async dropDatabaseIfExists(dbName, params = {}) { return this.dropDatabase(dbName, { ...params, ifNotExists: true }); }

    /**
     * Returns a database instance.
     * 
     * @param String            dbName
     * @param Object            params
     * 
     * @return Database
     */
    database(dbName, params = {}) {
        const schemasMap = this.$.schemas;
        if (!schemasMap.has(dbName)) {
            schemasMap.set(dbName, {
                name: dbName,
                tables: new Map,
                hiddenAs: 'inmemory',
            });
        }
        return new this.constructor.Database(this, ...arguments);
    }

    /**
     * BASE LOGICS
     */

    /**
     * Base logic for the searchPath() method.
     * 
     * @param Function          callback
     * @param Array             path
     * 
     * @return String
     */
    async searchPathCallback(callback, ...path) {
        if (path.length) {
            const returnValue = await callback(path);
            this.$.searchPath = path;
            return returnValue;
        }
        if (!this.$.searchPath) { this.$.searchPath = await callback(); }
        return this.$.searchPath;
    }

    /**
     * Base logic for the searchPath() method.
     * 
     * @param String          tblName
     * 
     * @return String
     */
    async getBasename(tblName) {
        const searchPath = await this.searchPath();
        return searchPath.reduce(async (prev, dbName) => (await prev) || (await this.database(dbName).tables({ name: tblName })).length ? dbName : null, null);
    }

    /**
     * Base logic for the databases() method.
     * 
     * @param Function          callback
     * @param Object            filter
     * @param Array             standardExclusions
     * 
     * @return Array
     */
    async databasesCallback(callback, filter = {}, standardExclusions = []) {
        const schemasMap = this.$.schemas;
        if (!schemasMap._touched || filter.force) {
            schemasMap._touched = true;
            for (let db of await callback()) {
                if (typeof db === 'string') { db = { name: db }; }
                if (schemasMap.has(db.name)) {
                    delete schemasMap.has(db.name).hiddenAs;
                } else { schemasMap.set(db.name, { ...db, tables: new Map }); }
            }
        }
        let dbList = [...schemasMap.values()].filter(db => !db.hiddenAs).map(db => db.name);
        if (filter.name) {
            dbList = dbList.filter(dbName => dbName === filter.name);
        } else if (!filter.includeStandardExclusions) {
            const OBJ_INFOSCHEMA_DB = this.constructor.OBJ_INFOSCHEMA_DB;
            const standardExclusionsRe = new RegExp(`^${ standardExclusions.concat(OBJ_INFOSCHEMA_DB).join('|') }$`, 'i');
            dbList = dbList.filter(dbName => !standardExclusionsRe.test(dbName));
        }
        return dbList;
    }

    /**
     * Base logic for describeTable()
     * 
     * @param Function          callback
     * @param String|Object|CreateDatabase     dbSchema
     * @param Object            params
     * 
     * @return Object
     */
    async createDatabaseCallback(callback, dbSchema, params = {}) {
        let dbCreateInstance;
        if (dbSchema instanceof CreateDatabase) {
            dbCreateInstance = dbSchema;
            dbSchema = dbCreateInstance.toJson();
        } else {
            if (typeof dbSchema === 'string') { dbSchema = { name: dbSchema }; }
            if (typeof dbSchema !== 'object' || !dbSchema.name) throw new Error(`Invalid argument#1 to createDatabase().`);
            // First we validate operation
            const dbFound = (await this.databases(dbSchema))[0];
            if (dbFound) {
                if (params.ifNotExists) return;
                throw new Error(`Database ${ dbSchema.name } already exists.`);
            }
            // Then forward the operation for execution
            dbCreateInstance = CreateDatabase.fromJson(this/*IMPORTANT: not db API*/, dbSchema);
            if (params.ifNotExists) dbCreateInstance.withFlag('IF_NOT_EXISTS');
        }
        // ------
        // Must be before db changes below
        const dbApi = this.database(dbSchema.name, params);
        const schemasMap = this.$.schemas, tablesSavepoints = new Set;
        // DB changes now
        let onAfterCreateCalled;
        const onAfterCreate = async () => {
            onAfterCreateCalled = true;
            delete schemasMap.get(dbSchema.name).hiddenAs; // This does really exist now
            schemasMap.get(dbSchema.name).schemaEdit = { get tablesSavepoints() { return tablesSavepoints; } };
            for (const tblSchema of dbSchema.tables || []) {
                await dbApi.createTable(tblSchema, params);
            }
            delete schemasMap.get(dbSchema.name).schemaEdit;
        };
        await callback(dbCreateInstance, onAfterCreate, params);
        // AFTER WE NOW EXISTS
        if (!onAfterCreateCalled) await onAfterCreate();
        // Create savepoint?
        let savepointCreation = true;
        if (params.noCreateSavepoint || (new RegExp(`^${ this.constructor.OBJ_INFOSCHEMA_DB }$`)).test(dbSchema.name)) {
            savepointCreation = false;
        }
        if (savepointCreation) {
            await this.createSavepoint({
                savepoint_desc: params.savepointDesc || 'Database create',
                // Current state
                name_snapshot: null, // How we know created
                // New state
                current_name: dbSchema.name,
            }, tablesSavepoints);
        }
        return dbApi;
    }

    /**
     * Base logic for alterDatabase()
     * 
     * @param Function          callback
     * @param String|Object|AlterDatabase     dbAlterRequest
     * @param Function          editCallback
     * @param Object            params
     * 
     * @return Object
     */
    async alterDatabaseCallback(callback, dbAlterRequest, editCallback, params = {}) {
        const schemasMap = this.$.schemas, tablesSavepoints = new Set;
        let dbAlterInstance, dbName, dbSchema;
        let onAfterAfterCalled, onAfterAlter = () => {};
        if (dbAlterRequest instanceof AlterDatabase) {
            // Remap arguments
            dbAlterInstance = dbAlterRequest;
            dbName = dbAlterInstance.NAME;
            params = editCallback || {};
            // Create savepount data
            dbSchema = schemasMap.get(dbName);
        } else if (typeof editCallback === 'function') {
            let tablesAlterRequest = [];
            if (typeof dbAlterRequest === 'object' && dbAlterRequest) {
                if (Array.isArray(dbAlterRequest.tables)) { tablesAlterRequest = dbAlterRequest.tables; }
                dbName = dbAlterRequest.name;
            } else { dbName = dbAlterRequest; }
            if (typeof dbName !== 'string') throw new Error(`Invalid argument#1 to alterDatabase().`);
            // First we validate operation
            const dbFound = (await this.databases({ name: dbName }))[0];
            if (!dbFound) {
                if (params.ifExists) return;
                throw new Error(`Database ${ dbName } does not exist.`);
            }
            // Singleton DB schema
            dbSchema = schemasMap.get(dbName);
            // For recursive operations
            if (dbSchema.schemaEdit) return await editCallback(dbSchema.schemaEdit);
            // On to snapshots; before the database changes below
            const dbApi = this.database(dbName, params);
            // On to editing work; but first load all necessary table schemas into memory
            const dbSchemaEdit = CreateDatabase.cloneJson(dbSchema);
            const tableSchemas = await dbApi.describeTable(tablesAlterRequest, params);
            Object.defineProperty(dbSchemaEdit, 'tables', { value: tableSchemas.map(tableSchema => CreateTable.cloneJson(tableSchema)) });
            Object.defineProperties(dbSchemaEdit.tables, {
				get: { value: name => dbSchemaEdit.tables.find(x => x.name === name), configurable: true },
				has: { value: name => dbSchemaEdit.tables.get(name) ? true : false, configurable: true },
				delete: { value: name => dbSchemaEdit.tables.splice(dbSchemaEdit.tables.findIndex(x => x.name === name), 1), configurable: true },
			});
            Object.defineProperty(dbSchemaEdit, 'tablesSavepoints', { get() { return tablesSavepoints; } });
            // Call for editing
            dbSchema.schemaEdit = dbSchemaEdit;
            await editCallback(dbSchemaEdit);
            // Diff into a AlterDatabase instance
            dbAlterInstance = AlterDatabase.fromDiffing(this/*IMPORTANT: not db API*/, dbSchema, dbSchemaEdit);
            // Handle tableSchema edits
            onAfterAlter = async ($dbName = dbName) => {
                onAfterAfterCalled = true;
                const tableDiffs = AlterTable.fromDiffing2d(dbApi/*IMPORTANT: not client API*/, tableSchemas, dbSchemaEdit.tables);
                for (const diff of tableDiffs) {
                    if (diff.type === 'DROP') { await dbApi.dropTable(diff.argument, params); }
                    if (diff.type === 'ADD') { await dbApi.createTable(diff.argument, params); }
                    if (diff.type === 'ALTER') { await dbApi.alterTable(diff.argument, params); }
                    
                }
                delete dbSchema.schemaEdit; // Cleanup
            };
        } else {
            throw new Error(`Alter database "${ dbName }" called without a valid callback function.`);
        }
        // ------
        // DB changes now
        await callback(dbAlterInstance, onAfterAlter, params);
        const newDbName = dbAlterInstance.ACTIONS.find(action => action.TYPE === 'RENAME' && !action.REFERENCE)?.ARGUMENT;
        if (newDbName) {
            // Modify original schema to immediately reflect the db changes
            dbSchema.name = newDbName;
            schemasMap.delete(dbName);
            schemasMap.set(dbSchema.name, dbSchema);
        }
        // ------
        // AFTER WE NOW Executed ALTER
        if (!onAfterAfterCalled) await onAfterAlter(newDbName || dbName);
        // ------
        // Create savepoint
        let savepoint, savepointCreation = dbAlterInstance.ACTIONS.length || tablesSavepoints.size;
        if (params.noCreateSavepoint || (new RegExp(`^${ this.constructor.OBJ_INFOSCHEMA_DB }$`)).test(dbName)) {
            savepointCreation = false;
        }
        if (savepointCreation) {
            savepoint = await this.createSavepoint({
                savepoint_desc: params.savepointDesc || 'Database alter',
                // Current state
                name_snapshot: dbName, // Old name
                // New state
                current_name: newDbName || dbName,
            }, tablesSavepoints);
        }
        // ------
        // Done
        return savepoint;
    }

    /**
     * Base logic for dropDatabase()
     * 
     * @param Function          callback
     * @param String            dbName
     * @param Object            params
     * 
     * @return Object
     */
    async dropDatabaseCallback(callback, dbName, params = {}) {
        let dbDropInstance;
        if (dbName instanceof DropDatabase) {
            dbDropInstance = dbName;
            dbName = dbDropInstance.NAME;
        } else {
            // First we validate operation
            const dbFound = (await this.databases({ name: dbName }))[0];
            if (!dbFound) {
                if (params.ifExists) return;
                throw new Error(`Database ${ dbName } does not exist.`);
            }
            // Then forward the operation for execution
            dbDropInstance = new DropDatabase(this/*IMPORTANT: not db API*/, dbName);
            if (params.ifExists) dbDropInstance.withFlag('IF_EXISTS');
            if (params.cascade) dbDropInstance.withFlag('CASCADE');
        }
        const schemasMap = this.$.schemas;
        const dbSchema = schemasMap.get(dbName);
        if (dbSchema.schemaEdit) throw new Error(`Cannot delete database when already in edit mode.`);
        // -----------------
        // Must be before db changes below
        let savepointCreation = true, tablesSavepoints;
        if (params.noCreateSavepoint || (new RegExp(`^${ this.constructor.OBJ_INFOSCHEMA_DB }$`)).test(dbSchema.name)) {
            savepointCreation = false;
        }
        if (savepointCreation) {
            const dbApi = this.database(dbName, params);
            tablesSavepoints = new Set((await dbApi.describeTable('*')).map(tblSchema => ({
                // Snapshot
                name_snapshot: tblSchema.name,
                columns_snapshot: JSON.stringify(tblSchema.columns),
                constraints_snapshot: JSON.stringify(tblSchema.constraints),
                indexes_snapshot: JSON.stringify(tblSchema.indexes),
                // New state
                current_name: null, // How we know deleted
            })));
        }
        // -----------------
        // DB changes now
        await callback(dbDropInstance, params);
        // -----------------
        // Then update records
        dbSchema.hiddenAs = 'dropped';
        //dbSchema.tables.clear();
        for (const [ , tblSchema ] of dbSchema.tables) { tblSchema.hiddenAs = 'dropped'; }
        // -----------------
        // Main savepoints
        if (savepointCreation) {
            return this.createSavepoint({
                savepoint_desc: params.savepointDesc || 'Database drop',
                // Current state
                name_snapshot: dbSchema.name,
                // New state
                current_name: null, // How we know deleted
            }, tablesSavepoints);
        }
    }

    /**
     * Base logic for dropDatabase()
     * 
     * @param Function          callback
     * @param String|Function   query
     * @param Object            params
     * @param Bool              acceptsSql
     * 
     * @return Object
     */
    async queryCallback(callback, query, params = {}, acceptsSql = false) {
        if (typeof query === 'string' && (!acceptsSql/*always parse*/ || (/^SELECT[ ]/i.test(query) && !params.isStandardSql/*needs parsing*/))) {
            query = Parser.parse(this, query);
        } else if (typeof query === 'function') {
            const Types = { Insert, Update, Delete, Select, DropDatabase, DropTable, CreateDatabase, CreateTable, AlterDatabase, AlterTable };
            const type = params.type?.toLowerCase().replace(/^\w|_./g, m => m.toUpperCase().replace('_', '')) || 'Select';
            const $query = new Types[type](this);
            query = (query($query), $query);
        }
        return await callback(query, params);
    }

    /**
     * Method for saving snapshots to internal OBJ_INFOSCHEMA db.
     * 
     * @param Object            entry
     * @param Set               tblEntires
     * 
     * @return Object
     */
    async createSavepoint(entry, tblEntries = new Set) {
        // Commit to DB
        const OBJ_INFOSCHEMA_DB = this.constructor.OBJ_INFOSCHEMA_DB;
        const infoSchemaDB = this.database(OBJ_INFOSCHEMA_DB);
        if (!(await this.databases({ name: OBJ_INFOSCHEMA_DB }))[0]) {
            await this.createDatabase(OBJ_INFOSCHEMA_DB);
            await infoSchemaDB.createTable({
                name: 'database_savepoints',
                columns: [
                    { name: 'id', type: 'uuid', primaryKey: true, default: { expr: 'gen_random_uuid()' } },
                    { name: 'name_snapshot', type: 'varchar' },
                    { name: 'savepoint_desc', type: 'varchar' },
                    { name: 'savepoint_date', type: 'timestamp' },
                    { name: 'rollback_date', type: 'timestamp' },
                    { name: 'current_name', type: 'varchar' },
                ],
            });
            await infoSchemaDB.createTable({
                name: 'table_savepoints',
                columns: [
                    { name: 'savepoint_id', type: 'uuid', references: { table: 'database_savepoints', columns: ['id'], deleteRule: 'cascade' } },
                    { name: 'name_snapshot', type: 'varchar' },
                    { name: 'columns_snapshot', type: 'json' },
                    { name: 'constraints_snapshot', type: 'json' },
                    { name: 'indexes_snapshot', type: 'json' },
                    { name: 'current_name', type: 'varchar' },
                ],
            });
        }
        // ------------------
        // Resolve forward histories before creating new one
        const dbName = [OBJ_INFOSCHEMA_DB,'database_savepoints'];
        let where = x => x.in( y => y.literal(entry.name_snapshot || entry.current_name), ['active','name_snapshot'], ['active','current_name']);
        while(where) {
            const rolledbackSavepoints = await this.query(q => {
                q.select(['active','id'], x => x.name(['following','id']).as('id_following'));
                q.from(dbName).as('active');
                q.leftJoin(dbName).as('following').on( x => x.equals(['following','name_snapshot'], ['active','current_name']) );
                q.where( where );
                q.where( x => x.isNotNull(['active','rollback_date']) );
                q.orderBy(['active','savepoint_date']).withFlag('ASC');
                q.limit(1);
            });
            if (rolledbackSavepoints[0]?.id) {
                await this.query(q => {
                    q.from(dbName);
                    q.where( x => x.equals('id', y => y.literal(rolledbackSavepoints[0].id) ) );
                }, { type: 'delete' });
            }
            if (rolledbackSavepoints[0]?.id_following) { where = x => x.equals(['active','id'], y => y.literal(rolledbackSavepoints[0].id_following) ); }
            else { where = null; }
        }
        // ------------------
        // Create savepoint
        const insertResult = await infoSchemaDB.table('database_savepoints').add({ ...entry, savepoint_date: 'now()' });
        const savepoint = new Savepoint(this, { ...insertResult.toJson(), id_active: null });
        if (tblEntries.size) {
            tblEntries = [ ...tblEntries ].map(tblEntry => ({ ...tblEntry, savepoint_id: savepoint.id }));
            await infoSchemaDB.table('table_savepoints').addAll(tblEntries);
        }
        return savepoint;
    }
}