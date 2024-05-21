
export default class Savepoint {
    
    /**
     * @constructor
     */
    constructor(client, details, direction = 'backward') {
        Object.defineProperty(this, '$', { value: {
            client,
            details,
            direction,
        }});
    }

    /**
     * @property Driver
     */
    get client() { return this.$.client; }

    /**
     * @property String
     */
    get id() { return this.$.details.id; }

    /**
     * @property String
     */
    get name_snapshot() { return this.$.details.name_snapshot; }

    /**
     * @property String
     */
    get savepoint_desc() { return this.$.details.savepoint_desc; }

    /**
     * @property Date
     */
    get savepoint_date() { return this.$.details.savepoint_date; }

    /**
     * @property Date
     */
    get rollback_date() { return this.$.details.rollback_date; }

    /**
     * @property String
     */
    get current_name() { return this.$.details.current_name; }

    /**
     * @property Bool
     */
    get id_active() { return 'id_active' in this.$.details ? this.$.details.id_active : undefined }

    /**
     * @property String
     */
    get direction() { return this.$.direction; }

    /**
     * @returns Object
     */
    toJson() { return { ...this.$.details }; }

    /**
     * @returns Bool
     */
    async status() {
        const currentSavepointInDb = (await this.client.database(this.current_name || this.name_snapshot).savepoint({ direction: this.direction })) || {};
        if (currentSavepointInDb.id === this.id) {
            this.$.details.rollback_date = currentSavepointInDb.rollback_date;
            this.$.details.id_active = currentSavepointInDb.id_active;
            return { canRollback: true };
        }
        return { canRollback: false };
    }

    /**
     * Returns tables associated with current savepoint.
     * 
     * @return Array
     */
    async getAssociatedSnapshots() {
        const OBJ_INFOSCHEMA_DB = this.client.constructor.OBJ_INFOSCHEMA_DB;
        return this.client.query(q => {
            q.select('*');
            q.from([OBJ_INFOSCHEMA_DB,'table_savepoints']);
            q.where( c => c.equals('savepoint_id', q => q.literal(this.id)) );
        });
    }

    /**
     * Method for restoring db schema to an identified savepoint.
     * 
     * @param Object            params
     * 
     * @return Object
     */
    async rollback(params = {}) {
        // Validate instance
        if (!this.current_name && !this.name_snapshot) throw new Error(`Invalid savepoint; null record.`);
        if (!(await this.status()).canRollback) throw new Error(`Invalid rollback order.`);
        // Validated
        const getTableSnapshots = async () => {
            const tableSnapshots = await this.getAssociatedSnapshots();
            return tableSnapshots.map(tableSnapshot => ({
                // Identity
                name: tableSnapshot.name_snapshot,
                $name: tableSnapshot.current_name,
                database: this.current_name,
                // Lists
                columns: tableSnapshot.columns_snapshot.map(col => ({
                    ...col,
                    ...(this.direction === 'forward' && col.$name ? { name: col.$name, $name: col.name } : {}),
                })),
                constraints: tableSnapshot.constraints_snapshot.map(cnst => ({
                    ...cnst,
                    ...(this.direction === 'forward' && cnst.$constraintName ? { constraintName: cnst.$constraintName, $constraintName: cnst.constraintName } : {}),
                })),
                indexes: tableSnapshot.indexes_snapshot.map(ndx => ({
                    ...ndx,
                    ...(this.direction === 'forward' && ndx.$indexName ? { indexName: ndx.$indexName, $indexName: ndx.indexName } : {}),
                })),
            }));
        };
        const errors = {}, noCreateSavepoint = this.direction === 'forward' || this.id_active;
        if (!this.name_snapshot) {
            // We are at db's creation point. Drop database - to non existence.
            if (params.allowMutateDB) {
                await this.client.dropDatabase(this.current_name, { cascade: true, noCreateSavepoint });
            } else { errors.noMutateDB = true; }
        } else if (!this.current_name) {
            // We are at db's drop point. Recreate database - back to existence.
            if (params.allowMutateDB) {
                await this.client.createDatabase({ name: this.name_snapshot, tables: await getTableSnapshots() }, { noCreateSavepoint });
            } else { errors.noMutateDB = true; }
        } else {
            const tables = await getTableSnapshots();
            await this.client.alterDatabase({ name: this.current_name, tables: tables.map(tbl => tbl.$name/*if tbl is in db*/).filter(tblName => tblName) }, dbSchemaEdit => {
                dbSchemaEdit.name = this.name_snapshot;
                dbSchemaEdit.tables.splice(0);
                dbSchemaEdit.tables.push(...tables.filter(tbl => tbl.name/*if tbl isn't in db*/));
            }, { noCreateSavepoint });
        }
        if (Object.keys(errors).length) return false;
        // Update records now
        const OBJ_INFOSCHEMA_DB = this.client.constructor.OBJ_INFOSCHEMA_DB;
        const dbName = [OBJ_INFOSCHEMA_DB,'database_savepoints'];
        if (this.direction === 'forward') {
            this.$.details.rollback_date = null;
            await this.client.query(q => {
                q.table(dbName);
                q.set('rollback_date', null);
                q.where( x => x.equals('current_name', y => y.literal(this.name_snapshot)), x => x.isNotNull('rollback_date') );
            }, { type: 'update' });
        } else {
            this.$.details.rollback_date = new Date;
            await this.client.query(q => {
                q.table(dbName);
                q.set('rollback_date', x => x.call('now'));
                q.where( x => x.or(
                    y => y.equals('id', z => z.literal(this.id)),
                    y => y.and( z => z.equals('name_snapshot', z => z.literal(this.current_name) ), z => z.isNull('rollback_date') )
                ) );
            }, { type: 'update' });
        }
        return true;
    }
}