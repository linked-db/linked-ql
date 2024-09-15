
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import DatabaseSchema from '../lang/schema/db/DatabaseSchema.js';

export default class Savepoint {

    /**
     * @constructor
     */
    constructor(client, json, direction = 'backward') {
        Object.defineProperty(this, '$', {
            value: {
                client,
                json,
                direction,
            }
        });
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
    get cursor() { return this.$.json.$cursor; }

    /**
     * @returns Date
     */
    get savepointDate() { return this.$.json.savepoint_date; }

    /**
     * @returns String
     */
    get savepointDescription() { return this.$.json.savepoint_description; }

    /**
     * @returns String
     */
    get savepointRef() { return this.$.json.savepoint_ref; }

    /**
     * @returns Date
     */
    get rollbackDate() { return this.$.json.rollback_date; }

    /**
     * @returns String
     */
    get rollbackDescription() { return this.$.json.rollback_description; }

    /**
     * @returns String
     */
    get rollbackRef() { return this.$.json.rollback_ref; }

    /**
     * @returns Bool
     */
    get keep() { return this.$.json.keep; }

    /**
     * @returns String
     */
    get rollbackEffect() {
        const $outcome = typeof this.$.json.keep !== 'boolean' ? ['DROP', 'RECREATE'] : (this.$.json.keep === false ? ['RECREATE', 'DROP'] : ['ALTER']);
        return this.direction === 'forward' ? $outcome.reverse()[0] : $outcome[0];
    }

    /**
     * @returns String
     */
    get rollbackQuery() {
        const schema = DatabaseSchema.fromJSON(this.client, this.schema());
        if (this.direction !== 'forward') {
            schema.reverseAlt(true);
            schema.keep(schema.keep(), 'auto');
        }
        // Execute rollback
        if (schema.keep() === false) return DropStatement.fromJSON(this.client, { kind: 'SCHEMA', ident: schema.name() }).withFlag(this.client.params.dialect === 'mysql' ? '' : 'CASCADE');
        if (schema.keep() === true) return schema.getAlt().with({ resultSchema: schema });
        return CreateStatement.fromJSON(this.client, { kind: 'SCHEMA', argument: schema });
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
        const { name, $name, tables = [], keep } = this.$.json;
        return { name, ...($name ? { $name } : {}), tables, keep };
    }

    /**
     * @returns Object
     */
    toJSON() {
        const { id, database_tag: databaseTag, version_tag: versionTag, version_max: versionMax, $cursor, savepoint_date: savepointDate, savepoint_description: savepointDescription, savepoint_ref: savepointRef, rollback_date: rollbackDate, rollback_description: rollbackDescription, rollback_ref: rollbackRef } = this.$.json;
        return { id, name: this.name(), databaseTag, versionTag, versionMax, cursor: $cursor, savepointDate, savepointDescription, savepointRef, rollbackDate, rollbackDescription, rollbackRef, rollbackEffect: this.rollbackEffect };
    }

    /**
     * @returns Bool
     */
    async isNextPointInTime() {
        const currentSavepoint = (await this.client.database(this.name()).savepoint({ direction: this.direction })) || {};
        return currentSavepoint.id === this.$.json.id;
    }

    /**
     * Method for restoring db schema to an identified savepoint.
     * 
     * @return Void
     */
    async rollback(details = {}) {
        if (!(await this.isNextPointInTime())) throw new Error(`Invalid rollback order.`);
        await this.client.query(this.rollbackQuery, { noCreateSavepoint: true });
        const linkedDB = await this.client.linkedDB();
        const savepointsTable = linkedDB.savepointsTable();
        // Update record
        const updatedRecord = await savepointsTable.update({
            rollback_date: q => this.direction === 'forward' ? q.null() : q.fn('now'),
            rollback_description: details.description,
            rollback_ref: details.reference,
        }, { where: { id: q => q.value(this.$.json.id) }, returning: ['rollback_date'] });
        this.$.json.rollback_date = updatedRecord[0].rollback_date;
        return true;
    }
}