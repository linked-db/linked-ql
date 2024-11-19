import { DatabaseSchema } from '../lang/ddl/database/DatabaseSchema.js';
import { RootSchema } from '../lang/ddl/RootSchema.js';

export class Savepoint {

    constructor(client, json) {
        Object.defineProperty(this, '$', {
            value: {
                client,
                json,
            }
        });
    }

    get client() { return this.$.client; }

    id() { return this.$.json.id; }

    masterSavepoint() { return this.$.json.master_savepoint; }

    name(postRestore = false) {
        if (postRestore) return this.versionState() === 'rollback' && this.$.json.$name || this.$.json.name;
        return this.versionState() === 'commit' && this.$.json.$name || this.$.json.name;
    }

    schema() {
        const { name, $name, tables = [], status } = this.$.json;
        return DatabaseSchema.fromJSON(this.client, { name, ...($name ? { $name } : {}), tables, status });
    }

    cascades() {
        this.$._cascades = this.$._cascades || (this.$.json.cascades || []).map(cascade => new Savepoint(this.client, cascade));
        return this.$._cascades;
    }

    databaseTag() { return this.$.json.database_tag; }

    versionTag() { return this.$.json.version_tag; }

    versionTags() { return this.$.json.version_tags || [this.$.json.version_tag]; }

    versionUp() { return this.versionTags().reduce((prev, v) => prev || (v > this.versionTag() ? v : 0), 0); }

    versionDown() { return [...this.versionTags()].reverse().reduce((prev, v) => prev || (v < this.versionTag() ? v : 0), 0); }

    versionMax() { return Math.max(...this.versionTags()); }

    versionState() { return this.$.json.version_state; }

    commitDate() { return this.$.json.commit_date; }

    commitDesc() { return this.$.json.commit_desc; }

    commitClientID() { return this.$.json.commit_client_id; }

    commitClientPID() { return this.$.json.commit_client_pid; }

    rollbackDate() { return this.$.json.rollback_date; }

    rollbackDesc() { return this.$.json.rollback_desc; }

    rollbackClientID() { return this.$.json.rollback_client_id; }

    rollbackClientPID() { return this.$.json.rollback_client_pid; }

    restoreEffect() {
        const $outcome = this.$.json.status === 'new' ? ['DROP', 'RECREATE'] : (this.$.json.status === 'obsolete' ? ['RECREATE', 'DROP'] : ['ALTER']);
        return this.versionState() === 'rollback' ? $outcome.reverse()[0] : $outcome[0];
    }

    reverseSQL() {
        if (this.versionState() === 'rollback') return this.querify(true);
        return [this.querify(true), ...this.cascades().map(c => c.reverseSQL())].join('\n');
    }

    static fromJSON(context, json) {
        return new this(context, json);
    }

    jsonfy() {
        return this.$.json;
    }

    querify(reversed = false) {
        let rootSchema = RootSchema.fromJSON(this.client, [this.schema()]);
        let $reversed = this.versionState() === 'rollback';
        if (reversed) $reversed = !$reversed;
        if ($reversed) {
            rootSchema = rootSchema.reverseDiff({ forceNormalize: true, honourCDLIgnoreList: this.versionState() === 'rollback' });
        }
        return rootSchema.generateCDL({ cascadeRule: 'CASCADE' }).actions()[0];
    }

    async isNextRestorePoint() {
        const currentSavepoint = (await this.client.database(this.name()).savepoint({ lookAhead: this.versionState() === 'rollback', withCascades: false })) || {};
        return currentSavepoint.id?.() === this.$.json.id;
    }

    async rollback(rollbackParams = {}) {
        if (this.versionState() === 'rollback') throw new Error(`Already in rollback state.`);
        return await this.restore(rollbackParams);
    }

    async recommit(commitParams = {}) {
        if (this.versionState() === 'commit') throw new Error(`Already in commit state.`);
        return await this.restore(commitParams);
    }

    async restore(restoreParams = {}) {
        if (this.masterSavepoint()) {
            if (this.versionState() === 'commit') {
                const query = this.querify(true);
                if (query) await this.client.withMode('restore', () => this.client.query(query));
            }
        } else {
            if (!(await this.isNextRestorePoint())) throw new Error(`Invalid restore order.`);
            await this.client.withMode('restore', () => this.client.query(this.querify(true)));
        }
        const linkedDB = await this.client.linkedDB();
        // Update record
        const versionState = this.versionState() === 'rollback' ? 'commit' : 'rollback';
        const updatedRecord = await linkedDB.table('savepoints').update({
            data: {
                ['version_state']: versionState,
                [`${versionState}_date`]: q => q.now(),
                [`${versionState}_desc`]: restoreParams.desc || this[`${versionState}Desc`](),
                [`${versionState}_client_id`]: this.client.params.clientID || this[`${versionState}ClientID`](),
                [`${versionState}_client_pid`]: (q) => q.fn(this.client.params.dialect === 'mysql' ? 'connection_id' : 'pg_backend_pid'),
            },
            where: (q) => q.eq('id', (q) => q.value(this.$.json.id)), returning: ['*']
        });
        for (const cascade of this.cascades()) {
            await cascade.restore(restoreParams);
        }
        this.$.json = updatedRecord[0];
        return true;
    }
}