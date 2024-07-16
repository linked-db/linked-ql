
import CreateDatabase from "../../query/create/CreateDatabase.js";

export default class Savepoint {
    
    /**
     * @constructor
     */
    constructor(client, json, direction = 'backward') {
        Object.defineProperty(this, '$', { value: {
            client,
            json,
            direction,
        }});
    }

    /**
     * @returns Driver
     */
    get client() { return this.$.client; }

    /**
     * @returns String
     */
    get direction() { return this.$.direction; }

    /**
     * @returns String
     */
    get id() { return this.$.json.id; }

    /**
     * @returns String
     */
    get databaseTag() { return this.$.json.database_tag; }

    /**
     * @returns Number
     */
    get versionTag() { return this.$.json.version_tag; }

    /**
     * @returns Number
     */
    get versionMax() { return this.$.json.version_max; }

    /**
     * @returns Number
     */
    get cursor() { return this.$.json.cursor; }

    /**
     * @returns String
     */
    get description() { return this.$.json.savepoint_description; }

    /**
     * @returns Date
     */
    get savepointDate() { return this.$.json.savepoint_date; }

    /**
     * @returns Date
     */
    get rollbackDate() { return this.$.json.rollback_date; }

    /**
     * @returns String
     */
    get rollbackOutcome() {
        const $outcome = !this.$.json.status ? ['DROPPED','CREATED'] : (this.$.json.status === 'DOWN' ? ['CREATED','DROPPED'] : ['ALTERED']);
        return this.direction === 'forward' ? $outcome.reverse()[0] : $outcome[0];
    }

    /**
     * @returns String
     */
    name(postRollback = false) {
        if (postRollback) return this.direction === 'forward' && this.$.json.$name || this.$.json.name;
        return this.direction !== 'forward' && this.$.json.$name || this.$.json.name;
    }

    /**
     * @returns Object
     */
    schema() {
        const { name, $name, tables = [], status } = this.$.json;
        return { name, ...($name ? { $name } : {}), tables, status };
    }

    /**
     * @returns Object
     */
    toJson() {
        const { id, database_tag, version_tag, version_max, cursor, savepoint_description: description, savepoint_date, rollback_date } = this.$.json;
        return { id, name: this.name(), database_tag, version_tag, version_max, cursor, description, savepoint_date, rollback_date };
    }

    /**
     * @returns Bool
     */
    async canRollback() {
        const dbName = this.direction === 'forward' ? this.$.json.name : this.$.json.$name || this.$.json.name;
        const currentSavepoint = (await this.client.database(dbName).savepoint({ direction: this.direction })) || {};
        return currentSavepoint.id === this.$.json.id;
    }

    /**
     * Method for restoring db schema to an identified savepoint.
     * 
     * @return Void
     */
    async rollback() {
        if (!(await this.canRollback())) throw new Error(`Invalid rollback order.`);
        const schemaInstance = CreateDatabase.fromJson(this.client, this.schema());
        if (this.direction !== 'forward') {
            schemaInstance.reverseAlt(true);
            schemaInstance.status(schemaInstance.status(), true);
        }
        // Execute rollback
        if (schemaInstance.status() === 'DOWN') {
            this.client.dropDatabase(schemaInstance.name(), { cascade: true, noCreateSavepoint: true });
        } else if (schemaInstance.status() === 'UP') {
            const altInstance = schemaInstance.getAlt().with({ resultSchema: schemaInstance });
            this.client.query(altInstance, { noCreateSavepoint: true });
        } else this.client.query(schemaInstance, { noCreateSavepoint: true });
        // Update record
        const tblName = [this.client.constructor.OBJ_INFOSCHEMA_DB,'database_savepoints'].join('.');
        await this.client.query(`UPDATE ${ tblName } SET rollback_date = ${ this.direction === 'forward' ? 'NULL' : 'now()' } WHERE id = '${ this.$.json.id }'`);
        this.$.json.rollback_date = this.direction === 'forward' ? null : Date.now();
        return true;
    }
}