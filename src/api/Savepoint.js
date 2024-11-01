import { DatabaseSchema } from '../lang/ddl/database/DatabaseSchema.js';
import { AlterDatabase } from '../lang/ddl/AlterDatabase.js';
import { CreateDatabase } from '../lang/ddl/CreateDatabase.js';
import { DropDatabase } from '../lang/ddl/DropDatabase.js';

export class Savepoint {

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
    id() { return this.$.json.id; }

    /**
     * @returns String
     */
    masterSavepoint() { return this.$.json.master_savepoint; }

    /**
     * @returns String
     */
    name(postRollback = false) {
        if (postRollback) return this.versionState() === 'rollback' && this.$.json.$name || this.$.json.name;
        return this.versionState() === 'commit' && this.$.json.$name || this.$.json.name;
    }

    /**
     * @returns Object
     */
    schema() {
        const { name, $name, tables = [], status } = this.$.json;
        return DatabaseSchema.fromJSON(this.client, { name, ...($name ? { $name } : {}), tables, status });
    }

    /**
     * @returns Array
     */
    cascades() {
        this.$._cascades = this.$._cascades || (this.$.json.cascades || []).map(cascade => new Savepoint(this, cascade, this.$.direction));
        return this.$._cascades;
    }

    /**
     * @returns String
     */
    databaseTag() { return this.$.json.database_tag; }

    /**
     * @returns Number
     */
    versionTag() { return this.$.json.version_tag; }

    /**
     * @returns Array
     */
    versionTags() { return this.$.json.version_tags || [this.$.json.version_tag]; }

    /**
     * @returns String
     */
    versionState() { return this.$.json.version_state; }

    /**
     * @returns Date
     */
    commitDate() { return this.$.json.commit_date; }

    /**
     * @returns String
     */
    commitDesc() { return this.$.json.commit_desc; }

    /**
     * @returns String
     */
    commitRef() { return this.$.json.commit_ref; }

    /**
     * @returns Date
     */
    rollbackDate() { return this.$.json.rollback_date; }

    /**
     * @returns String
     */
    rollbackDesc() { return this.$.json.rollback_desc; }

    /**
     * @returns String
     */
    rollbackRef() { return this.$.json.rollback_ref; }

    /**
     * @returns Number
     */
    versionMax() { return Math.max(...this.versionTags()); }

    /**
     * @returns Number
     */
    versionUp() { return this.versionTags().reduce((prev, v) => prev || (v > this.versionTag() ? v : null), null); }

    /**
     * @returns Number
     */
    versionDown() { return [...this.versionTags()].reverse().reduce((prev, v) => prev || (v < this.versionTag() ? v : null), null); }

    /**
     * @returns String
     */
    rollbackEffect() {
        const $outcome = this.$.json.status === 'new' ? ['DROP', 'RECREATE'] : (this.$.json.status === 'obsolete' ? ['RECREATE', 'DROP'] : ['ALTER']);
        return this.versionState() === 'rollback' ? $outcome.reverse()[0] : $outcome[0];
    }

    /**
     * @returns String
     */
    rollbackQuery() {
        return [
            this.querify(true),
            ...this.cascades().map(c => c.rollbackQuery())
        ].join('\n');
    }

    /**
     * @returns Object
     */
    jsonfy() {
        const { name, $name, tables = [], status, ...rest } = this.$.json;
        return { name: this.name(), ...rest, schema: { name, ...($name ? { $name } : {}), tables, status } };
    }

    /**
     * @returns String
     */
    querify(reversed = false) {
        let schema = this.schema();
        let $reversed = this.versionState() === 'rollback';
        if (reversed) $reversed = !$reversed;
        if ($reversed) { schema = schema.reverseDiff({ honourCDLIgnoreList: true }); }
        // Execute rollback
        if (schema.status() === 'obsolete') return DropDatabase.fromJSON(this.client, { reference: schema.name() }).withFlag(this.client.params.dialect === 'mysql' ? '' : 'CASCADE');
        if (schema.status() === 'new') return CreateDatabase.fromJSON(this.client, { argument: schema.jsonfy() });
        return AlterDatabase.fromJSON(this.client, { reference: schema.name(), argument: schema.generateCDL() });
    }

    /**
     * @returns Bool
     */
    async isNextPointInTime() {
        const currentSavepoint = (await this.client.database(this.name()).savepoint({ direction: this.direction, withCascades: false })) || {};
        return currentSavepoint.id() === this.$.json.id;
    }

    /**
     * Method for restoring db schema to an identified savepoint.
     * 
     * @return Void
     */
    async rollback(details = {}) {
        if (!this.masterSavepoint() && !(await this.isNextPointInTime())) throw new Error(`Invalid rollback order.`);
        await this.client.query(this.querify(true), { noCreateSavepoint: true });
        const linkedDB = await this.client.linkedDB();
        // Update record
        const versionState = this.versionState() === 'rollback' ? 'commit' : 'rollback';
        const updatedRecord = await linkedDB.table('savepoints').update({
            ['version_state']: versionState,
            [`${versionState}_date`]: q => q.now(),
            [`${versionState}_desc`]: details.desc,
            [`${versionState}_ref`]: details.ref || this.client.params.commitRef,
            [`${versionState}_pid`]: q => q.fn(this.client.params.dialect === 'mysql' ? 'connection_id' : 'pg_backend_pid'),
        }, { where: q => q.eq('id', q => q.value(this.$.json.id)), returning: ['*'] });
        this.$.json = updatedRecord[0];
        for (const cascade of this.cascades()) {
            await cascade.rollback(details);
        }
        return true;
    }
}