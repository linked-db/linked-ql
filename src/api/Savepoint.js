import { DatabaseSchema } from '../lang/ddl/database/DatabaseSchema.js';
import { RootSchema } from '../lang/ddl/RootSchema.js';

export class Savepoint {

    /**
     * @constructor
     */
    constructor(client, json) {
        Object.defineProperty(this, '$', {
            value: {
                client,
                json,
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
        this.$._cascades = this.$._cascades || (this.$.json.cascades || []).map(cascade => new Savepoint(this.client, cascade));
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
    versionUp() { return this.versionTags().reduce((prev, v) => prev || (v > this.versionTag() ? v : 0), 0); }

    /**
     * @returns Number
     */
    versionDown() { return [...this.versionTags()].reverse().reduce((prev, v) => prev || (v < this.versionTag() ? v : 0), 0); }

    /**
     * @returns String
     */
    restoreEffect() {
        const $outcome = this.$.json.status === 'new' ? ['DROP', 'RECREATE'] : (this.$.json.status === 'obsolete' ? ['RECREATE', 'DROP'] : ['ALTER']);
        return this.versionState() === 'rollback' ? $outcome.reverse()[0] : $outcome[0];
    }

    /**
     * @returns String
     */
    restoreQuery() {
        if (this.versionState() === 'rollback') return this.querify(true);
        return [this.querify(true), ...this.cascades().map(c => c.restoreQuery())].join('\n');
    }

    /**
     * @returns this
     */
    static fromJSON(context, json) {
        return new this(context, json);
    }

    /**
     * @returns Object
     */
    jsonfy() {
        return this.$.json;
    }

    /**
     * @returns String
     */
    querify(reversed = false) {
        let rootSchema = RootSchema.fromJSON(this.client, [this.schema()]);
        let $reversed = this.versionState() === 'rollback';
        if (reversed) $reversed = !$reversed;
        if ($reversed) {
            rootSchema = rootSchema.reverseDiff({ forceNormalize: true, honourCDLIgnoreList: this.versionState() === 'rollback' });
        }
        return rootSchema.generateCDL({ cascade: true }).actions()[0];
    }

    /**
     * @returns Bool
     */
    async isNextRestorePoint() {
        const currentSavepoint = (await this.client.database(this.name()).savepoint({ direction: this.versionState() === 'commit' ? 'backward' : 'forward', withCascades: false })) || {};
        return currentSavepoint.id?.() === this.$.json.id;
    }

    /**
     * Rollback savepoint.
     * 
     * @param Object rollbackParams
     * 
     * @return Boolean
     */
    async rollback(rollbackParams = {}) {
        if (this.versionState() === 'rollback') throw new Error(`Already in rollback state.`);
        return await this.restore(rollbackParams);
    }

    /**
     * Recommit savepoint.
     * 
     * @param Object commitParams
     * 
     * @return Boolean
     */
    async recommit(commitParams = {}) {
        if (this.versionState() === 'commit') throw new Error(`Already in commit state.`);
        return await this.restore(commitParams);
    }

    /**
     * Method for restoring db schema to an identified savepoint.
     * 
     * @return Void
     */
    async restore(restoreParams = {}) {
        if (this.masterSavepoint()) {
            if (this.versionState() === 'commit') {
                const query = this.querify(true);
                if (query) await this.client.query(query, { noCreateSavepoint: true });
            }
        } else {
            if (!(await this.isNextRestorePoint())) throw new Error(`Invalid restore order.`);
            await this.client.query(this.querify(true), { noCreateSavepoint: true });
        }
        const linkedDB = await this.client.linkedDB();
        // Update record
        const versionState = this.versionState() === 'rollback' ? 'commit' : 'rollback';
        const updatedRecord = await linkedDB.table('savepoints').update({
            ['version_state']: versionState,
            [`${versionState}_date`]: q => q.now(),
            [`${versionState}_desc`]: restoreParams.desc || this[`${versionState}Desc`](),
            [`${versionState}_ref`]: restoreParams.ref || this.client.params.commitRef || this[`${versionState}Ref`](),
            [`${versionState}_pid`]: q => q.fn(this.client.params.dialect === 'mysql' ? 'connection_id' : 'pg_backend_pid'),
        }, { where: (q) => q.eq('id', (q) => q.value(this.$.json.id)), returning: ['*'] });
        for (const cascade of this.cascades()) {
            await cascade.restore(restoreParams);
        }
        this.$.json = updatedRecord[0];
        return true;
    }
}