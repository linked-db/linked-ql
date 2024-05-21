
import CreateTable from '../../query/create/CreateTable.js';
import AlterTable from '../../query/alter/AlterTable.js';
import DropTable from '../../query/drop/DropTable.js';
import Savepoint from './Savepoint.js';

export default class AbstractDatabase {
	
	/**
	 * @constructor
	 */
	constructor(client, dbName, params = {}) {
        this.$ = {
            client,
            schema: client.$.schemas.get(dbName),
            params
        };
	}

    /**
     * @property Client
     */
    get client() { return this.$.client; }

    /**
     * @property String
     */
    get name() { return this.$.schema.name; }

    /**
     * @property Object
     */
    get params() { return this.$.params; }

    /**
     * @property Bool
     */
    get dropped() { return this.$.schema.hiddenAs === 'dropped'; }
	
    /**
     * Returns list of tables.
     * 
     * @param Object            params
     * 
     * @return Array
     */
    async tables(params = {}) { return this.tablesCallback(() => ([]), ...arguments); }

    /**
     * Describes table.
     * 
     * @param String            tblName
     * @param Object            params
     * 
     * @return Object
     */
    async describeTable(tblName, params = {}) { return this.describeTableCallback((tblName, params) => {}, ...arguments); }

    /**
     * Creates table.
     * 
     * @param String            tblName
     * @param Object            tblSchema
     * @param Object            params
     * 
     * @return Object
     */
    async createTable(tblName, tblSchema = {}, params = {}) { return this.createTableCallback(() => ([]), ...arguments); }

    /**
     * Forwards to: createTable().
     * @with: params.ifNotExixts = true
     */
    async createTableIfNotExists(tblName, tblSchema = {}, params = {}) { return this.createTable(tblName, tblSchema, { ...params, ifNotExists: true }); }

    /**
     * Alters table.
     * 
     * @param String            tblName
     * @param Object            tblSchema
     * @param Object            params
     * 
     * @return Bool
     */
    async alterTable(tblName, tblSchema, params = {}) { return this.alterTableCallback((tblName, tblSchema, params) => {}, ...arguments); }

    /**
     * Drops table.
     * 
     * @param String            tblName
     * @param Object            params
     * 
     * @return Bool
     */
    async dropTable(tblName, params = {}) { return this.dropTableCallback((tblName, params) => {}, ...arguments); }

    /**
     * Forwards to: dropTable().
     * @with: params.ifExixts = true
     */
    async dropTableIfExists(tblName, params = {}) { return this.dropTable(tblName, { ...params, ifNotExists: true }); }

    /**
     * Returns a table instance.
     * 
     * @param String            tblName
     * @param Object            params
     * 
     * @return Bool
     */
    table(tblName, params = {}) {
        const tablesMap = this.$.schema.tables;
        if (!tablesMap.has(tblName)) {
            tablesMap.set(tblName, {
                name: tblName,
                hiddenAs: 'inmemory',
            });
        }
        return new this.constructor.Table(this, ...arguments);
    }

    /**
	 * Returns the database's current savepoint.
	 * 
     * @param Object params
	 * 
	 * @returns Object
     */
    async savepoint(params = {}) {
        const OBJ_INFOSCHEMA_DB = this.client.constructor.OBJ_INFOSCHEMA_DB;
        if ((await this.client.databases({ name: OBJ_INFOSCHEMA_DB }))[0]) {
            const forward = params.direction === 'forward';
            const dbName = [OBJ_INFOSCHEMA_DB,'database_savepoints'];
            const result = await this.client.query(q => {
                q.from(dbName).as(forward ? 'active' : 'preceding');
                if (forward) {
                    q.select( ['following','*'], f => f.name(['active','id']).as('id_active') );
                    q.rightJoin(dbName).as('following').on( x => x.equals(['following','name_snapshot'], ['active','current_name']) );
                    q.where( x => x.in( x => x.literal(this.name), ['active','name_snapshot'], ['active','current_name'] ), x => x.isNotNull(['active','rollback_date']) );
                    q.orderBy(['active','savepoint_date']).withFlag('ASC');
                } else {
                    q.select( ['preceding','*'], f => f.name(['active','id']).as('id_active') );
                    q.leftJoin(dbName).as('active').on( x => x.equals(['active','name_snapshot'], ['preceding','current_name']) );
                    q.where( x => x.in( x => x.literal(this.name), ['preceding','name_snapshot'], ['preceding','current_name'] ), x => x.isNull(['preceding','rollback_date']) );
                    q.orderBy(['preceding','savepoint_date']).withFlag('DESC');
                }
                q.limit(1);
            });
            return result[0] && new Savepoint(this.client, result[0], params.direction);
        }
    }

    /**
     * Base logic for the tables() method.
     * 
     * @param Function callback
     * @param Object filter
     * 
     * @return Array
     */
    async tablesCallback(callback, filter = {}) {
        const tablesMap = this.$.schema.tables;
        if (!tablesMap._touched || filter.force) {
            tablesMap._touched = true;
            for (let tbl of await callback()) {
                if (typeof tbl === 'string') { tbl = { name: tbl }; }
                if (tablesMap.has(tbl.name)) {
                    delete tablesMap.get(tbl.name).hiddenAs;
                } else { tablesMap.set(tbl.name, { ...tbl }); }
            }
        }
        let tblList = [...tablesMap.values()].filter(tbl => !tbl.hiddenAs).map(tbl => tbl.name);
        if (filter.name) { tblList = tblList.filter(tblName => tblName === filter.name); }
        return tblList;
    }

    /**
     * Base logic for describeTable()
     * 
     * @param Function          callback
     * @param String|Array      tblName_s
     * @param Object            params
     * 
     * @return Object
     */
    async describeTableCallback(callback, tblName_s, params = {}) {
        const isMultiple = Array.isArray(tblName_s);
        const tblNames = isMultiple ? tblName_s : [tblName_s];
        const isAll = tblNames.length === 1 && tblNames[0] === '*';
        if (this.dropped) return isAll || isMultiple ? [] : undefined;
        const tablesMap = this.$.schema.tables;
        const requestList = isAll ? ['*'] : tblNames;//TODO.filter(tblName => !tablesMap.get(tblName)?.columns && !tablesMap.get(tblName)?.hiddenAs);
        if (requestList.length) {
            const tblSchemas = await callback(requestList, params); // Describe should always add constraint names
            for (const tblSchema of tblSchemas) {
                if (tablesMap.has(tblSchema.name)) {
                    delete tablesMap.get(tblSchema.name).hiddenAs;
                    Object.assign(tablesMap.get(tblSchema.name), tblSchema);
                } else { tablesMap.set(tblSchema.name, tblSchema); }
            }
        }
        if (isAll) return [...tablesMap.values()].filter(tbl => !tbl.hiddenAs);
        if (isMultiple) return tblNames.map(tblName => tablesMap.get(tblName)).filter(tbl => !tbl.hiddenAs);
        return !tablesMap.get(tblName_s)?.hiddenAs ? tablesMap.get(tblName_s) : undefined;
    }

    /**
     * Base logic for createTable()
     * 
     * @param Function          callback
     * @param Object            tblSchema
     * @param Object            params
     */
    async createTableCallback(callback, tblSchema, params = {}) {
        await this.client.alterDatabase(this.name, async dbSchemaEdit => {
            let tblCreateRequest;
            if (tblSchema instanceof CreateTable) {
                tblCreateRequest = tblSchema;
                tblSchema = tblCreateRequest.toJson();
            } else {
                const tblFound = (await this.tables({ name: tblSchema.name }))[0];
                if (tblFound) {
                    if (params.ifNotExists) return;
                    throw new Error(`Table ${ tblSchema.name } already exists.`);
                }
                if (tblSchema.basename && tblSchema.basename !== this.name) {
                    throw new Error(`A table schema of database ${ tblSchema.basename } is being passed to ${ this.name }.`);
                }
                tblCreateRequest = CreateTable.fromJson(this.client/*IMPORTANT: client API*/, tblSchema);
                if (params.ifNotExists) tblCreateRequest.withFlag('IF_NOT_EXISTS');
            }
            // Important:
            tblCreateRequest.name([this.name,tblCreateRequest.NAME]);
            // Create savepoint
            dbSchemaEdit.tablesSavepoints.add({
                // Snapshot
                name_snapshot: null,
                columns_snapshot: JSON.stringify([]),
                constraints_snapshot: JSON.stringify([]),
                indexes_snapshot: JSON.stringify([]),
                // New state
                current_name: tblSchema.name
            });
            await callback(tblCreateRequest, params);
            // Update original objects in place
            const tablesMap = this.$.schema.tables;
            if (tablesMap.get(tblSchema.name)?.hiddenAs) {
                delete tablesMap.get(tblSchema.name).hiddenAs; // This does really exist now
            } else {
                tablesMap.set(tblSchema.name, { name: tblSchema.name });
            }
        }, { savepointDesc: 'Table create', ...params });
        return this.table(tblSchema.name, params);
    }

    /**
     * Base logic for alterTable()
     * 
     * @param Function          callback
     * @param String            tblName
     * @param Function          editCallback
     * @param Object            params
     */
    async alterTableCallback(callback, tblName, editCallback, params = {}) {
        return this.client.alterDatabase(this.name, async dbSchemaEdit => {
            let tblAlterRequest, tblSchema;
            if (tblName instanceof AlterTable) {
                // Remap arguments
                tblAlterRequest = tblName;
                tblName = tblAlterRequest.NAME;
                params = editCallback || {};
                // Create savepount data
                tblSchema = tblAlterRequest.JSON_BEFORE?.columns ? tblAlterRequest.JSON_BEFORE : await this.describeTable(tblName, params);
            } else if (typeof editCallback === 'function') {
                // First we validate operation
                const tblFound = (await this.tables({ name: tblName }))[0];
                if (!tblFound) {
                    if (params.ifExists) return;
                    throw new Error(`Table ${ tblName } does not exist.`);
                }
                // Singleton TBL schema
                tblSchema = await this.describeTable(tblName, params);
                // For recursive edits
                if (tblSchema.schemaEdit) return await editCallback(tblSchema.schemaEdit);
                // Fresh edit
                tblSchema.schemaEdit = CreateTable.cloneJson(tblSchema); // One global object
                // ------
                // Call for modification
                await editCallback(tblSchema.schemaEdit);
                // Diff into a AlterTable instance
                tblAlterRequest = AlterTable.fromDiffing(this.client/*IMPORTANT: client API*/, tblSchema, tblSchema.schemaEdit);
                if (params.ifExists) tblAlterRequest.withFlag('IF_EXISTS');
                delete tblSchema.schemaEdit;
            } else {
                throw new Error(`Alter table "${ tblName }" called with invalid arguments.`);
            }
            // Important:
            tblAlterRequest.name([this.name,tblAlterRequest.NAME]);
            const newTblName = tblAlterRequest.ACTIONS.find(action => action.TYPE === 'RENAME' && !action.REFERENCE)?.ARGUMENT;
            const newTblLocation = tblAlterRequest.ACTIONS.find(action => action.TYPE === 'RELOCATE')?.ARGUMENT;
            if (tblAlterRequest.ACTIONS.length) {
                // Create savepoint
                for (const action of tblAlterRequest.ACTIONS) {
                    if (action.TYPE === 'RENAME' && action.REFERENCE) {
                        const listName = action.REFERENCE.type === 'CONSTRAINT' ? 'constraints' : (action.REFERENCE.type === 'INDEX' ? 'indexes' : 'columns');
                        const nameKey = listName === 'constraints' ? 'constraintName' : (listName === 'indexes' ? 'indexName' : 'name');
                        tblSchema[listName].find(obj => obj[nameKey] === action.REFERENCE.name)[`$${ nameKey }`] = action.ARGUMENT;
                    }
                }
                dbSchemaEdit.tablesSavepoints.add({
                    // Snapshot
                    name_snapshot: tblSchema.name,
                    columns_snapshot: JSON.stringify(tblSchema.columns),
                    constraints_snapshot: JSON.stringify(tblSchema.constraints || []),
                    indexes_snapshot: JSON.stringify(tblSchema.indexes || []),
                    // New state
                    current_name: newTblName || tblName,
                });
                // Effect changes
                await callback(tblAlterRequest, params);
            }
            // Update original schema object in place
            // This lets describeTable() know to lookup remote db
            const tablesMap = this.$.schema.tables;
            delete tablesMap.get(tblName).columns;
            if (newTblName) { tblSchema.name = newTblName; }
            if (newTblLocation) {
                tblSchema.basename = newTblLocation;
                tablesMap.delete(tblName);
            }
        }, { savepointDesc: 'Table alter', ...params });
    }

    /**
     * Base logic for dropTable()
     * 
     * @param Function          callback
     * @param String            tblName
     * @param Object            params
     * 
     * @return Object
     */
    async dropTableCallback(callback, tblName, params = {}) {
        return this.client.alterDatabase(this.name, async dbSchemaEdit => {
            let tblDropRequest;
            if (tblName instanceof DropTable) {
                tblDropRequest = tblName;
                tblName = tblDropRequest.name;
            } else {
                // First we validate operation
                const tblFound = (await this.tables({ name: tblName }))[0];
                if (!tblFound) {
                    if (params.ifExists) return;
                    throw new Error(`Table ${ tblName } does not exist.`);
                }
                // Then forward the operation for execution
                tblDropRequest = new DropTable(this.client/*IMPORTANT: client API*/, tblName, this.name);
                if (params.ifExists) tblDropRequest.withFlag('IF_EXISTS');
                if (params.cascade) tblDropRequest.withFlag('CASCADE');
            }
            // Important:
            tblDropRequest.name([this.name,tblDropRequest.NAME]);
            // Create savepoint
            const tblSchema = await this.describeTable(tblName, params);
            if (tblSchema.schemaEdit) throw new Error(`Cannot delete table when already in edit mode.`);
            dbSchemaEdit.tablesSavepoints.add({
                // Snapshot
                name_snapshot: tblSchema.name,
                columns_snapshot: JSON.stringify(tblSchema.columns),
                constraints_snapshot: JSON.stringify(tblSchema.constraints),
                indexes_snapshot: JSON.stringify(tblSchema.indexes),
                // New state
                current_name: null, // How we know deleted
            });
            await callback(tblDropRequest, params);
            // Then update original schema object in place
            const tablesMap = this.$.schema.tables;
            tablesMap.get(tblName).hiddenAs = 'dropped';
            delete tablesMap.get(tblName).columns;
            delete tablesMap.get(tblName).constraints;
            delete tablesMap.get(tblName).indexes;
        }, { savepointDesc: 'Table drop', ...params });
    }
}