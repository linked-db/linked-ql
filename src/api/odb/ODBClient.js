import { AbstractClient } from '../AbstractClient.js';
import { ODBDatabase } from './ODBDatabase.js';
import { TableSchema } from '../../schema/TableSchema.js';
import { DatabaseSchema } from '../../schema/DatabaseSchema.js';
import { CreateStatement } from '../../lang/ddl/create/CreateStatement.js';
import { AlterStatement } from '../../lang/ddl/alter/AlterStatement.js';
import { DropStatement } from '../../lang/ddl/drop/DropStatement.js';
 
export class ODBClient extends AbstractClient {

    /**
     * Instance.
     * 
     * @param Object params 
     */
    constructor(storage = null, params = {}) {
        if (storage && !['set', 'get', 'has', 'delete'].every(m => typeof storage[m] === 'function')) throw new Error(`The options.storage parameter when provided must implement the Map interface.`);
        super({ storage: storage || new Map, params });
    }

    /**
     * @property Driver
     */
    get storage() { return this.$.storage; }


    /**
	 * Client kind.
     * 
     * @property String
	 */
    static kind = 'odb';

    /**
	 * Database class.
     * 
     * @property Object
	 */
    static Database = ODBDatabase;

	/**
     * Returns a list of databases.
     * 
     * @param Object params
     * 
     * @return Array
	 */
    async databases() { return [ ...(await this.storage.keys()) ]; }

    /**
     * Runs a query.
     * 
     * @param String            query
     * @param Object            params
     * 
     * @return Any
     */
    async query(query, params = {}) {
        return await this.queryCallback(async (target, query, params) => {
            let schemas = await this.schemas();
            const [ dbName, tblName ] = target.jsonfy();
            const existingDB = schemas.find(db => db.isSame(db.name(), dbName, 'ci'));
            const existingTBL = tblName && existingDB.table(tblName);
            // -- DDL?
            if ([CreateStatement,AlterStatement,DropStatement].some(x => query instanceof x)) {
                if (query instanceof DropStatement) {
                    if (!existingDB) { if (query.hasFlag('IF_EXISTS')) return; else throw new Error(`Database ${ dbName } does not exists.`); }
                    if (query.KIND === 'TABLE' && !existingTBL) { if (query.hasFlag('IF_EXISTS')) return; else throw new Error(`Table ${ tblName } does not exists.`); }
                    if (query.KIND === 'TABLE') existingTBL.keep(false).commitAlt(schemas);
                    else schemas = schemas.filter(db => db !== existingDB);
                    // Check with all tables and call updateDatabaseReferences() on them
                    for (const tbl of schemas.reduce((tbls, db) => tbls.concat(db.TABLES))) {
                        tbl.updateDatabaseReferences(this, altType);
                    }
                }
                if (query instanceof AlterStatement) {
                    if (!existingDB) throw new Error(`Database ${ dbName } does not exists.`);
                    if (query.KIND === 'TABLE' && !existingTBL) throw new Error(`Table ${ tblName } does not exists.`);
                    (query.KIND === 'TABLE' ? existingTBL : existingDB).alterWith(query);
                    // Check with all tables and call updateDatabaseReferences() on them
                    for (const tbl of schemas.reduce((tbls, db) => tbls.concat(db.TABLES))) {
                        if (query.KIND === 'TABLE') {
                            tbl.updateDatabaseReferences(this, altType);
                        } else {
                            tbl.updateDatabaseReferences(this, altType);
                        }
                    }
                }
                if (query instanceof CreateStatement) {
                    if (existingDB) { if (query.hasFlag('IF_NOT_EXISTS')) return; else throw new Error(`Database ${ dbName } already exists.`); }
                    if (query.KIND === 'TABLE' && existingTBL) { if (query.hasFlag('IF_NOT_EXISTS')) return; else throw new Error(`Table ${ tblName } already exists.`); }
                    if (query.KIND === 'TABLE') existingDB.table(query.ARGUMENT);
                    else schemas.push(query.ARGUMENT);
                }
            }
            // -- DML!
            if (query.expandable) await query.expand(true);
        }, ...arguments);
    }
}