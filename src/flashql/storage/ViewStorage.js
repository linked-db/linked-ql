import { TableStorage } from './TableStorage.js';
import { SYSTEM_TAG } from './TableStorage.js';

export class ViewStorage extends TableStorage {

    // --------- Origin commits handler

    async applyUpstreamCommit(commit) {

        if (!commit.computed && Array.isArray(commit.entries)) {
            const replicationAttrs = this.schema.view_mode_replication_attrs;

            const upstreamMvccKey = replicationAttrs.effective_upstream_mvcc_key;
            const upstreamMvccKey_isXMIN = upstreamMvccKey?.toUpperCase() === 'XMIN';

            const formatRow = (row) => ({
                ...(upstreamMvccKey_isXMIN
                    ? { ...row, __upstream_mvcc_tag: `${commit.txId}` }
                    : row),
                __staged: false,
            });

            for (const event of commit.entries) {
                if (event.op === 'insert') {
                    await super.upsert(formatRow(event.new), { systemTag: SYSTEM_TAG });
                } else if (event.op === 'update') {
                    const oldRef = event.old || event.key;
                    const updated = await super.update(oldRef, formatRow(event.new), { systemTag: SYSTEM_TAG });
                    if (!updated) await super.insert(formatRow(event.new), { systemTag: SYSTEM_TAG });
                } else if (event.op === 'delete') {
                    const oldRef = event.old || event.key;
                    await super.delete(oldRef, { systemTag: SYSTEM_TAG });
                }
            }
            return;
        }

        if (commit.type === 'diff' && Array.isArray(commit.entries)) {
            for (const event of commit.entries) {
                if (event.op === 'insert') {
                    const row = { __id: event.newHash, __staged: false, ...event.new };
                    await super.upsert(row, { systemTag: SYSTEM_TAG });
                } else if (event.op === 'update') {
                    const oldKey = { __id: event.oldHash };
                    const newRow = { __id: event.newHash, __staged: false, ...event.new };
                    const updated = await super.update(oldKey, newRow, { systemTag: SYSTEM_TAG });
                    if (!updated) await super.insert(newRow, { systemTag: SYSTEM_TAG });
                } else if (event.op === 'delete') {
                    await super.delete({ __id: event.oldHash }, { systemTag: SYSTEM_TAG });
                }
            }
            return;
        }

        // commit.type === 'swap' not applicable

        if (commit.type === 'result') {
            const rows = commit.rows.map((row, i) =>
                commit.hashes?.[i] ? { __id: commit.hashes[i], __staged: false, ...row } : { __staged: false, ...row }
            );
            await this.reset({ syncForget: false });
            for (const row of rows) {
                await super.insert(row, { systemTag: SYSTEM_TAG });
            }
            return;
        }
    }

    // --------- Std APIs: local / origin write entry pints

    #buildUpstreamPayload(payload, replicationAttrs) {
        const upstreamPayload = Object.create(null);
        let mvccTag = null;

        if (!(typeof payload === 'object' && payload)) {
            if (this.schema.keyColumns.length !== 1)
                throw new SyntaxError(`[${this.prettyName}] Couldn't resolve input to at least a key object`);
            payload = { [this.schema.keyColumns[0]]: payload };
        }

        const columnMapping = replicationAttrs.column_mapping;

        for (const [localName, value] of Object.entries(payload)) {
            if (localName === '__upstream_mvcc_tag') {
                mvccTag = value;
            }
            if (localName.startsWith('__')) continue;

            if (replicationAttrs.derived_columns.includes(localName))
                throw new TypeError(`[${this.prettyName}] Column ${localName} is immutable through this view`);

            const upstreamName = columnMapping[localName];
            if (!upstreamName) throw new TypeError(`[${this.prettyName}] Column ${localName} is not updateable through this view`);

            upstreamPayload[upstreamName] = value;
        }

        return [mvccTag, upstreamPayload];
    }

    #formatAsStaged(row) {
        return { ...row, __staged: true };
    }

    #retrieveCurrentRows(oldPk, { using: keyName = null, multiple = false } = {}) {
        const currentRows = [].concat(super.get(oldPk, { using: keyName, multiple, hiddenCols: true }) || []);
        if (!currentRows.length) {
            throw new Error(`[${this.prettyName}] Could not resolve the referenced local row(s) for origin-bound write`);
        }
        return currentRows;
    }

    async insert(newRow, { systemTag = null } = {}) {
        if (systemTag) {
            // This is a system call – either from:
            // boottime WAL replay
            // DDL manipulation
            // Upstream sync event
            return await super.insert(newRow, { systemTag });
        }

        const replicationAttrs = this.schema.view_mode_replication_attrs;
        const isRuntimeView = this.schema.view_opts_replication_mode === 'none';
        const isLocalFirst = this.schema.view_opts_replication_opts.write_policy === 'local_first';

        if (!replicationAttrs.insertable)
            throw new Error(`[${this.prettyName}] Cannot insert to origin table through this view`);

        const [, upstreamNewRow] = this.#buildUpstreamPayload(newRow, replicationAttrs);
        const changePayload = {
            relation_id: this.schema.id,
            origin: replicationAttrs.effective_replication_origin,
            event: {
                op: 'insert',
                relation: replicationAttrs.upstream_relation,
                new: upstreamNewRow,
            }
        };

        this.tx.recordUpstreamChange(changePayload, { queued: !isRuntimeView });
        if (isLocalFirst)
            await super.insert(this.#formatAsStaged(newRow), { systemTag: SYSTEM_TAG });

        return newRow;
    }

    async update(oldPk, newRow, { using: keyName = null, multiple = false, systemTag = null } = {}) {
        if (systemTag) {
            // This is a system call – either from:
            // boottime WAL replay
            // DDL manipulation
            // Upstream sync event
            return await super.update(oldPk, newRow, { using: keyName, multiple, systemTag });
        }

        const replicationAttrs = this.schema.view_mode_replication_attrs;
        const isRuntimeView = this.schema.view_opts_replication_mode === 'none';
        const isLocalFirst = this.schema.view_opts_replication_opts.write_policy === 'local_first';

        if (!replicationAttrs.updatable)
            throw new Error(`[${this.prettyName}] Cannot update origin table through this view`);

        const [, upstreamNewRow] = this.#buildUpstreamPayload(newRow, replicationAttrs);
        const currentRows = isRuntimeView
            ? [].concat(oldPk)
            : this.#retrieveCurrentRows(oldPk, { using: keyName, multiple });

        for (const old of currentRows) {
            const [mvccTag, upstreamOldRow] = this.#buildUpstreamPayload(old, replicationAttrs);

            const changePayload = {
                relation_id: this.schema.id,
                origin: replicationAttrs.effective_replication_origin,
                event: {
                    op: 'update',
                    relation: replicationAttrs.upstream_relation,
                    old: upstreamOldRow,
                    new: { ...upstreamNewRow },
                    mvccTag,
                }
            };

            this.tx.recordUpstreamChange(changePayload, { queued: !isRuntimeView });
        }

        if (isLocalFirst)
            await super.update(oldPk, this.#formatAsStaged(newRow), { using: keyName, multiple, systemTag: SYSTEM_TAG });
        
        return multiple ? currentRows : currentRows[0];
    }

    async delete(oldPk, { using: keyName = null, multiple = false, systemTag = null } = {}) {
        if (systemTag) {
            // This is a system call – either from:
            // boottime WAL replay
            // DDL manipulation
            // Upstream sync event
            return await super.delete(oldPk, { using: keyName, multiple, systemTag });
        }

        const replicationAttrs = this.schema.view_mode_replication_attrs;
        const isRuntimeView = this.schema.view_opts_replication_mode === 'none';
        const isLocalFirst = this.schema.view_opts_replication_opts.write_policy === 'local_first';

        if (!replicationAttrs.deletable)
            throw new Error(`[${this.prettyName}] Cannot delete origin row through this view`);

        const currentRows = isRuntimeView
            ? [].concat(oldPk)
            : this.#retrieveCurrentRows(oldPk, { using: keyName, multiple });
        for (const old of currentRows) {
            const [mvccTag, upstreamOldRow] = this.#buildUpstreamPayload(old, replicationAttrs);

            const changePayload = {
                relation_id: this.schema.id,
                origin: replicationAttrs.effective_replication_origin,
                event: {
                    op: 'delete',
                    relation: replicationAttrs.upstream_relation,
                    old: upstreamOldRow,
                    mvccTag,
                }
            };

            this.tx.recordUpstreamChange(changePayload, { queued: !isRuntimeView });
        }

        if (isLocalFirst)
            await super.delete(oldPk, { using: keyName, multiple, systemTag: SYSTEM_TAG });

        return multiple ? currentRows : currentRows[0];
    }

    // --------- View state handlers

    async reset({ assertReplicationMode = null, syncForget = true } = {}) {
        const activeReplicationMode = this.schema.view_opts_replication_mode;

        if (assertReplicationMode && activeReplicationMode !== assertReplicationMode) {
            throw new Error(`The referenced view ${JSON.stringify(this.namespace)}.${JSON.stringify(this.name)} has a different replication mode "${activeReplicationMode}" than the implied "${assertReplicationMode}"`);
        }

        await this.truncate({ systemTag: SYSTEM_TAG });
        if (syncForget) await this.tx.storageEngine.sync.forget({ [this.namespace]: this.name }, { tx: this.tx });
    }

    async refresh({ assertReplicationMode = null } = {}) {
        const result = await this.reset({ assertReplicationMode });
        await this.tx.storageEngine.sync.sync({ [this.namespace]: this.name }, { forceSync: true, tx: this.tx });
        return result;
    }
}
