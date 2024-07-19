
import Parser from '../../query/Parser.js';
import Node from '../../query/abstracts/Node.js';
import CreateTable from '../../query/create/CreateTable.js';
import CreateDatabase from '../../query/create/CreateDatabase.js';
import AlterTable from '../../query/alter/AlterTable.js';
import AlterDatabase from '../../query/alter/AlterDatabase.js';
import DropTable from '../../query/drop/DropTable.js';
import DropDatabase from '../../query/drop/DropDatabase.js';
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
     * Returns a JSON representation of a database and its tables.
     * 
     * @param String name
     * @param Array tables
     * @param Object params
     * 
     * @return Object
     */
    async describeDatabase(name, tables = ['*'], params = {}) {
        return { name, tables: await this.database(name).describeTable(tables, params), };
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
        // -- Compose an schemaInstamce from request
        const schemaInstamce = CreateDatabase.fromJson(this, createSpec);
        if (params.ifNotExists) schemaInstamce.withFlag('IF_NOT_EXISTS');
        return await this.query(schemaInstamce, params);
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
        const schemaInstance = CreateDatabase.fromJson(this, schemaJson).keep(true, true);
        await callback(schemaInstance);
        const altInstance = schemaInstance.getAlt().with({ resultSchema: schemaInstance });
        if (!altInstance.ACTIONS.length) return;
        return await this.query(altInstance, params);
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
        const dropInstamce = DropDatabase.fromJson(this, { name: dbName });
        if (params.ifExists) dropInstamce.withFlag('IF_EXISTS');
        if (params.cascade) dropInstamce.withFlag('CASCADE');
        return await this.query(dropInstamce, params);
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
        else if (!(query instanceof Node)) throw new Error(`query() called with invalid arguments.`);
        const instanceOf = (o, classes) => classes.some(c => o instanceof c);
        // -- Generate resultSchema for AlterDatabase and DropDatabase? We'll need it for savepoint creation or per driver's request for it (params.$resultSchema === 'always')
        const scope = {};
        const resultSchemaRequired = dbName => dbName && !(new RegExp(dbName, 'i')).test(this.constructor.OBJ_INFOSCHEMA_DB) && (!params.noCreateSavepoint || params.$resultSchema === 'always');
        if (instanceOf(query, [CreateDatabase,AlterDatabase,DropDatabase]) && resultSchemaRequired(query.name())) {
            if (query instanceof DropDatabase) {
                const resultSchema = CreateDatabase.fromJson(this, await this.describeDatabase(query.name(), '*')).drop();
                query.with({ resultSchema });
            } else if (query instanceof AlterDatabase && !query.resultSchema) {
                const tablesList = query.ACTIONS.filter(a => ['ALTER','DROP'].includes(a.TYPE)).map(x => x.NAME);
                const resultSchema = CreateDatabase.fromJson(this, await this.describeDatabase(query.name(), tablesList)).keep(true, true).alterWith(query); // Simulate edits;
                query.with({ resultSchema });
            } else if (query instanceof CreateDatabase) query.with({ resultSchema: query });
            // -- And that's what we'll use as snapshot
            scope.savepoint = query.resultSchema;
        } else if (instanceOf(query, [CreateTable,AlterTable,DropTable])) {
            const basename = query.basename() || await this.basenameGet(query.name(), true);
            if (resultSchemaRequired(basename)) {
                const dbApi = this.database(basename);
                if (query instanceof DropTable && basename) {
                    const resultSchema = CreateTable.fromJson(dbApi, await dbApi.describeTable(query.name())).drop();
                    query.with({ resultSchema });
                } else if (query instanceof AlterTable && !query.resultSchema && basename) {
                    const resultSchema = CreateTable.fromJson(dbApi, await dbApi.describeTable(query.name())).keep(true, true).alterWith(query); // Simulate edits;
                    query.with({ resultSchema });
                } else if (query instanceof CreateTable && basename) query.with({ resultSchema: query });
                // -- But this is what we'll use as snapshot
                if (!params.noCreateSavepoint && basename) {
                    scope.savepoint = CreateDatabase.fromJson(this, {
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
            SELECT id, database_tag, name, "$name", keep, version_tag, version_max, rank_for_cursor || '/' || total AS cursor, savepoint_description, tables, savepoint_date, rollback_date FROM (
                SELECT
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY rollback_date IS NOT NULL ${ params.direction === 'forward' ? 'DESC' : 'ASC' }, version_tag ${ params.direction === 'forward' ? 'ASC' : 'DESC' }) AS rank_for_target,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY version_tag ASC) AS rank_for_cursor,
                MAX(version_tag) OVER (PARTITION BY database_tag) AS version_max,
                COUNT(version_tag) OVER (PARTITION BY database_tag) AS total,
                * FROM ${ tblName }${ params.name ? (params.direction === 'forward' ? `WHERE name = '${ params.name }'` : `WHERE COALESCE("$name", name) = '${ params.name }'`) : '' }
            ) AS savepoint WHERE rollback_date IS ${ params.direction === 'forward' ? 'NOT NULL' : 'NULL' } AND rank_for_target = 1
        `);
        return result.map(savepoint => new Savepoint(this, savepoint, params.direction))
    }

    /**
     * Method for saving snapshots to internal OBJ_INFOSCHEMA db.
     * 
     * @param CreateDatabase    schemaInstamce
     * @param String            description
     * 
     * @return Object
     */
    async createSavepoint(schemaInstamce, description = null) {
        // -- Create schema?
        const OBJ_INFOSCHEMA_DB = this.constructor.OBJ_INFOSCHEMA_DB;
        if (!(await this.hasDatabase(OBJ_INFOSCHEMA_DB))) {
            await this.createDatabase({
                name: OBJ_INFOSCHEMA_DB,
                tables: [{
                    name: 'database_savepoints',
                    columns: [
                        { name: 'id', type: 'uuid', primaryKey: true, default: { expr: 'gen_random_uuid()' } },
                        // Actual snapshot
                        { name: 'name', type: 'varchar', notNull: true },
                        { name: '$name', type: 'varchar' },
                        { name: 'tables', type: 'json' },
                        { name: 'keep', type: 'boolean' },
                        // Meta data
                        { name: 'savepoint_description', type: 'varchar' },
                        { name: 'database_tag', type: 'varchar', notNull: true },
                        { name: 'version_tag', type: 'int', notNull: true },
                        { name: 'savepoint_date', type: 'timestamp', notNull: true },
                        { name: 'rollback_date', type: 'timestamp' },
                    ],
                }],
            }, { noCreateSavepoint: true });
        }
        // -- Savepoint JSON
        const savepointJson = {
            database_tag: null,
            ...schemaInstamce.toJson(),
            savepoint_description: description,
            version_tag: null,
            savepoint_date: new Date,
        };
        // -- Find a match first. We're doing forward first to be able to restart an entire history that has been rolled all the way back
        const currentSavepoint = (await this.database(schemaInstamce.name()).savepoint({ direction: 'forward' })) || await this.database(schemaInstamce.name()).savepoint();
        if (currentSavepoint) {
            const tblName = [OBJ_INFOSCHEMA_DB,'database_savepoints'].join('.');
            // -- Apply id and tag from lookup
            savepointJson.database_tag = currentSavepoint.databaseTag;
            // -- Get version_max and delete all forward records
            if (currentSavepoint.direction === 'forward') {
                savepointJson.version_tag = (await this.query(`SELECT max(version_tag) AS version_max FROM ${ tblName } WHERE database_tag = '${ currentSavepoint.databaseTag }'`))[0].version_max + 1;
                await this.query(`DELETE FROM ${ tblName } WHERE database_tag = '${ currentSavepoint.databaseTag }' AND rollback_date IS NOT NULL`);
            } else { savepointJson.version_tag = currentSavepoint.versionTag + 1; }
        } else {
            // -- Generate tag and version as fresh
            savepointJson.database_tag = `db:${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }`;
            savepointJson.version_tag = 1;
        }
        // -- Create record
        const insertResult = await this.database(OBJ_INFOSCHEMA_DB).table('database_savepoints').insert(savepointJson);
        return new Savepoint(this, { ...insertResult[0], version_max: savepointJson.version_tag, cursor: null });
    }
}