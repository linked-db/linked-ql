
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
    get commitDate() { return this.$.json.commit_date; }

    /**
     * @returns String
     */
    get commitDesc() { return this.$.json.commit_desc; }

    /**
     * @returns String
     */
    get commitRef() { return this.$.json.commit_ref; }

    /**
     * @returns Date
     */
    get rollbackDate() { return this.$.json.rollback_date; }

    /**
     * @returns String
     */
    get rollbackDesc() { return this.$.json.rollback_desc; }

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
        const { id, database_tag: databaseTag, version_tag: versionTag, version_max: versionMax, $cursor, commit_date: commitDate, commit_desc: commitDesc, commit_ref: commitRef, rollback_date: rollbackDate, rollback_desc: rollbackDesc, rollback_ref: rollbackRef } = this.$.json;
        return { id, name: this.name(), databaseTag, versionTag, versionMax, cursor: $cursor, commitDate, commitDesc, commitRef, rollbackDate, rollbackDesc, rollbackRef, rollbackEffect: this.rollbackEffect };
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
        // Update record
        const updatedRecord = await linkedDB.table('savepoints').update({
            rollback_date: q => this.direction === 'forward' ? q.null() : q.fn('now'),
            rollback_desc: details.desc,
            rollback_ref: details.ref || this.client.params.commitRef,
            rollback_pid: q => q.literal(this.client.params.dialect === 'mysql' ? 'connection_id()' : 'pg_backend_pid()'),
        }, { where: { id: q => q.value(this.$.json.id) }, returning: ['rollback_date'] });
        this.$.json.rollback_date = updatedRecord[0].rollback_date;
        return true;
    }
}