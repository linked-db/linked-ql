import { SimpleEmitter } from '../../clients/abstracts/SimpleEmitter.js';
import { matchRelationSelector, normalizeRelationSelectorArg } from '../../clients/abstracts/util.js';
import { ConflictError } from '../errors/ConflictError.js';
import { SYSTEM_TAG } from '../../proc/SYSTEM.js';

export class SyncManager extends SimpleEmitter {

    static OUTSYNC_RETRY_BASE_MS = 1000;

    #storageEngine;
    #activeRealtimeJobs = new Map;
    #queuedSyncSelector = null;
    #syncDrainPromise = null;

    constructor(storageEngine) {
        super();
        this.#storageEngine = storageEngine;
    }

    async #transaction(cb, { inputTx = null, ...txOpts } = {}) {
        return await this.#storageEngine.transaction(cb, { ...txOpts, parentTx: inputTx });
    }

    #classifyError(error) {
        return error instanceof ConflictError || error?.name === 'ConflictError' ? 'conflict' : 'error';
    }

    #emitIssue(error, context = {}) {
        const event = this.#classifyError(error);
        const payload = { ...context, error };
        this.emit(event, payload);
        return payload;
    }

    #mergeSelectors(currentSelector, nextSelector) {
        if (currentSelector === '*'
            || nextSelector === '*'
            || typeof currentSelector === 'function'
            || typeof nextSelector === 'function') {
            return '*';
        }
        if (!currentSelector) return nextSelector;

        const merged = normalizeRelationSelectorArg(currentSelector);
        const nextMap = normalizeRelationSelectorArg(nextSelector);

        for (const [nsPattern, tblPatterns] of Object.entries(nextMap)) {
            if (!merged[nsPattern]) {
                merged[nsPattern] = [...tblPatterns];
                continue;
            }
            merged[nsPattern] = [...new Set([...merged[nsPattern], ...tblPatterns])];
        }

        return merged;
    }

    #mergeSummary(target, incoming) {
        for (const viewId of incoming.materialized) {
            if (!target.materialized.includes(viewId)) {
                target.materialized.push(viewId);
            }
        }
        for (const viewId of incoming.realtime) {
            if (!target.realtime.includes(viewId)) {
                target.realtime.push(viewId);
            }
        }
        target.failed.push(...incoming.failed);
    }

    // ------------

    async sync(selector = '*', { forceSync = false, tx: inputTx = null } = {}) {
        this.#queuedSyncSelector = this.#mergeSelectors(this.#queuedSyncSelector, selector);
        if (!this.#syncDrainPromise) {
            this.#syncDrainPromise = this.#drainSyncQueue({ forceSync, inputTx });
        }
        return await this.#syncDrainPromise;
    }

    async start(selector = '*', { tx: inputTx = null } = {}) {
        const summary = { realtime: [], failed: [] };
        const views = await this.#resolveViews(selector, { inputTx });

        for (const view of views) {
            if (view.view_opts_replication_mode !== 'realtime') continue;
            try {
                await this.#updateJob(view.id, {
                    enabled: true,
                    state: 'idle',
                    updated_at: Date.now(),
                }, { inputTx, ensureWith: view });

                await this.#startRealtimeView(view, { forceSync: false, inputTx });
                summary.realtime.push(view.id);
            } catch (e) {
                this.#emitIssue(e, { phase: 'insync', relation_id: view.id });
                summary.failed.push({ relation_id: view.id, error: String(e?.message || e) });
            }
        }

        return summary;
    }

    async stop(selector = '*', { disable = true, tx: inputTx = null } = {}) {
        const views = await this.#resolveViews(selector, { inputTx });
        const stopped = [];

        for (const view of views) {
            if (view.view_opts_replication_mode !== 'realtime') continue;

            const sub = this.#activeRealtimeJobs.get(view.id);
            if (sub) {
                this.#activeRealtimeJobs.delete(view.id);
                await sub.abort();
            }

            await this.#updateJob(view.id, {
                state: 'idle',
                enabled: disable ? false : true,
                updated_at: Date.now(),
            }, { inputTx, ensureWith: view });
            stopped.push(view.id);
        }

        return { stopped };
    }

    async resume(selector = '*', { tx: inputTx = null } = {}) {
        const views = await this.#resolveViews(selector, { inputTx });
        const resumed = [];

        for (const view of views) {
            const job = await this.#ensureJob(view, { inputTx });
            if (job.enabled) continue;

            await this.#updateJob(view.id, {
                enabled: true,
                state: 'idle',
                updated_at: Date.now(),
            }, { inputTx });
            resumed.push(view.id);
        }

        const synced = resumed.length
            ? await this.sync((view) => resumed.includes(view.id), { tx: inputTx })
            : { materialized: [], realtime: [], failed: [] };

        return { resumed, ...synced };
    }

    async status(selector = '*', { tx: inputTx = null } = {}) {
        const views = await this.#resolveViews(selector, { inputTx });
        if (!views.length) return [];

        return await this.#transaction(async (tx) => {
            const jobs = tx.getRelation({ namespace: 'sys', name: 'sys_insync_jobs' });
            return views.map((view) => {
                const job = jobs.get({ relation_id: view.id }, { using: 'sys_insync_jobs__relation_id_idx' });
                return {
                    relation_id: view.id,
                    namespace: view.namespace,
                    name: view.name,
                    replication_mode: view.view_opts_replication_mode,
                    mode: job?.mode || null,
                    enabled: !!job?.enabled,
                    state: job?.state || 'idle',
                    slot_id: job?.slot_id || null,
                    last_seen_commit: Number.isInteger(job?.last_seen_commit) ? job.last_seen_commit : null,
                    retry_count: Number.isInteger(job?.retry_count) ? job.retry_count : 0,
                    last_error: job?.last_error || null,
                    updated_at: job?.updated_at || null,
                };
            });
        }, { inputTx });
    }

    async forget(selector, { tx: inputTx = null } = {}) {
        const view = (await this.#resolveViews(selector, { inputTx }))[0];
        if (!view) return null;

        // Drop any active realtime session
        const sub = this.#activeRealtimeJobs.get(view.id);
        if (sub) {
            this.#activeRealtimeJobs.delete(view.id);
            await sub.abort();
        }

        // Execute forget first
        if (view.view_opts_replication_mode === 'realtime') {
            const replicationAttrs = view.view_mode_replication_attrs;

            const upstreamRelation = replicationAttrs.mapping_level === 'table'
                ? replicationAttrs.upstream_relation
                : null;
            const sourceClient = await this.#storageEngine.getEffectiveClient(view);

            const slotId = `lq_sync_${view.id}`;
            if (upstreamRelation) {
                await sourceClient.wal.forget(slotId);
            } else await sourceClient.live.forget(slotId);
        }

        // Delete local job entry
        return await this.#transaction(async (tx) => {
            const jobs = tx.getRelation({ namespace: 'sys', name: 'sys_insync_jobs' });
            return await jobs.delete({ relation_id: view.id }, { using: 'sys_insync_jobs__relation_id_idx', systemTag: SYSTEM_TAG });
        }, { inputTx });
    }

    async shutdown() {
        for (const [relationId, sub] of this.#activeRealtimeJobs.entries()) {
            this.#activeRealtimeJobs.delete(relationId);
            await sub.abort();
        }
    }

    // ------------

    async #drainSyncQueue({ forceSync = false, inputTx = null }) {
        const summary = { materialized: [], realtime: [], failed: [] };
        try {
            while (this.#queuedSyncSelector !== null) {
                const selector = this.#queuedSyncSelector;
                this.#queuedSyncSelector = null;
                this.#mergeSummary(summary, await this.#runSyncCycle(selector, { forceSync, inputTx }));
            }
            return summary;
        } catch (e) {
            this.#emitIssue(e, { phase: 'sync' });
            throw e;
        } finally {
            this.#syncDrainPromise = null;
            if (this.#queuedSyncSelector !== null) {
                this.#syncDrainPromise = this.#drainSyncQueue({ inputTx });
            }
        }
    }

    async #runSyncCycle(selector = '*', { forceSync, inputTx }) {
        const summary = { materialized: [], realtime: [], failed: [] };
        const views = await this.#resolveViews(selector, { inputTx });

        await this.#runOutsyncCycle(views, { forceSync, inputTx, summary });

        for (const view of views) {
            await this.#runInsyncForView(view, { forceSync, inputTx, summary });
        }

        return summary;
    }

    // ------------ In-Sync

    async #runInsyncForView(view, { forceSync = false, inputTx = null, summary = null } = {}) {
        try {
            const job = await this.#ensureJob(view, { inputTx });
            if (!job.enabled) return;

            if (view.view_opts_replication_mode === 'materialized') {
                await this.#runMaterializedInsync(view, job, { forceSync, inputTx, summary });
            }

            if (view.view_opts_replication_mode === 'realtime') {
                await this.#runRealtimeInsync(view, { forceSync, inputTx, summary });
            }
        } catch (e) {
            this.#emitIssue(e, { phase: 'insync', relation_id: view.id });
            summary?.failed.push({ relation_id: view.id, error: String(e?.message || e) });
        }
    }

    async #runMaterializedInsync(view, job, { forceSync = false, inputTx = null, summary = null } = {}) {
        // Materialized views are one-off jobs; rerun only when missing/failure state.
        if (job.state === 'synced' && job.last_success_at && !forceSync) return;
        await this.#materializeView(view, { inputTx });
        summary?.materialized.push(view.id);
    }

    async #runRealtimeInsync(view, { forceSync = false, inputTx = null, summary = null } = {}) {
        await this.#startRealtimeView(view, { forceSync, inputTx });
        summary?.realtime.push(view.id);
    }

    // ------------ Out-Sync

    async #runOutsyncCycle(views, { forceSync = false, inputTx = null, summary = null } = {}) {
        if (!views.length) return [];

        const eligibleRows = await this.#listEligibleOutsyncRows(views, { forceSync, inputTx });
        for (const queueRow of eligibleRows) {
            await this.#processOutsyncRow(queueRow, { inputTx, summary });
        }
        return eligibleRows;
    }

    async #listEligibleOutsyncRows(views, { forceSync = false, inputTx = null } = {}) {
        const viewsById = new Map(views.map((view) => [view.id, view]));
        const now = Date.now();

        return await this.#transaction(async (tx) => {
            const outsyncQueue = tx.getRelation({ namespace: 'sys', name: 'sys_outsync_queue' });
            return outsyncQueue.getAll({ hiddenCols: true })
                .filter((row) => viewsById.has(row.relation_id)
                    && ['pending', 'failed'].includes(row.status)
                    && (forceSync || !Number.isInteger(row.next_retry_at) || row.next_retry_at <= now))
                .sort((a, b) => (a.created_at || 0) - (b.created_at || 0) || a.id - b.id);
        }, { inputTx });
    }

    async #processOutsyncRow(queueRow, { inputTx = null, summary = null } = {}) {
        const view = await this.#resolveOutsyncView(queueRow, { inputTx });
        if (!view) return;

        const commit = this.#buildOutsyncCommit(queueRow);

        try {
            await this.#dispatchOutsyncCommit(queueRow.origin, commit);
            await this.#markOutsyncApplied(queueRow.id, { inputTx });
        } catch (e) {
            const queueStatus = e instanceof ConflictError || e?.name === 'ConflictError' ? 'conflicted' : 'failed';
            await this.#markOutsyncFailure(queueRow.id, e, { queueStatus, inputTx });
            summary?.failed.push({ relation_id: view.id, queue_id: queueRow.id, error: String(e?.message || e) });
            this.#emitIssue(e, { phase: 'outsync', relation_id: view.id, queue_id: queueRow.id, queue_status: queueStatus });
        }
    }

    async #resolveOutsyncView(queueRow, { inputTx = null } = {}) {
        return await this.#transaction(async (tx) => {
            return tx.getRelation({ id: queueRow.relation_id, assertIsView: true, ifExists: true });
        }, { inputTx });
    }

    #buildOutsyncCommit(queueRow, timestamp = Date.now()) {
        return {
            txId: null,
            commitTime: null,
            entries: [queueRow.event_payload],
            timestamp,
        };
    }

    async #dispatchOutsyncCommit(origin, commit) {
        if (origin) {
            const upstreamClient = await this.#storageEngine.getUpstreamClient(origin);
            await upstreamClient.wal.applyDownstreamCommit(commit);
            return;
        }
        await this.#storageEngine.wal.applyDownstreamCommit(commit);
    }

    async #markOutsyncApplied(queueId, { inputTx = null } = {}) {
        await this.#transaction(async (tx) => {
            const outsyncQueue = tx.getRelation({ namespace: 'sys', name: 'sys_outsync_queue' });
            const current = outsyncQueue.get(queueId, { hiddenCols: true });
            if (!current) return;
            await outsyncQueue.update(current, {
                status: 'applied',
                last_error: null,
                updated_at: Date.now(),
                next_retry_at: null,
            }, { systemTag: SYSTEM_TAG });
        }, { inputTx });
    }

    async #markOutsyncFailure(queueId, error, { queueStatus = 'failed', inputTx = null } = {}) {
        await this.#transaction(async (tx) => {
            const outsyncQueue = tx.getRelation({ namespace: 'sys', name: 'sys_outsync_queue' });
            const current = outsyncQueue.get(queueId, { hiddenCols: true });
            if (!current) return;
            const retryCount = (current.retry_count || 0) + 1;
            await outsyncQueue.update(current, {
                status: queueStatus,
                retry_count: retryCount,
                last_error: String(error?.message || error),
                updated_at: Date.now(),
                next_retry_at: queueStatus === 'conflicted' ? null : this.#computeOutsyncNextRetryAt(retryCount, Date.now()),
            }, { systemTag: SYSTEM_TAG });
        }, { inputTx });
    }

    #computeOutsyncNextRetryAt(retryCount = 0, now = Date.now()) {
        const delay = SyncManager.OUTSYNC_RETRY_BASE_MS * Math.max(1, retryCount + 1);
        return now + delay;
    }

    // ------------

    async #resolveViews(selector = '*', { inputTx }) {
        const selectorFn = typeof selector === 'function' ? selector : null;
        const selectorMap = selectorFn ? null : normalizeRelationSelectorArg(selector);

        return await this.#transaction(async (tx) => {
            const views = tx.listViews({ replication_mode: ['materialized', 'realtime'] }, { details: true });
            const withNamespaces = views.map((view) => ({
                ...view,
                namespace: view.namespace_id.name,
                namespaceDef: view.namespace_id,
            }));

            if (selectorFn) return withNamespaces.filter(selectorFn);
            if (selector === '*') return withNamespaces;

            return withNamespaces.filter((view) => {
                for (const [nsPattern, tblPatterns] of Object.entries(selectorMap)) {
                    if (matchRelationSelector(view.namespace, [nsPattern])
                        && matchRelationSelector(view.name, tblPatterns)) {
                        return true;
                    }
                }
                return false;
            });
        }, { inputTx });
    }

    async #ensureJob(view, { inputTx }) {
        const now = Date.now();

        return await this.#transaction(async (tx) => {
            const jobs = tx.getRelation({ namespace: 'sys', name: 'sys_insync_jobs' });
            const existing = jobs.get({ relation_id: view.id }, { using: 'sys_insync_jobs__relation_id_idx' });
            if (existing) return existing;

            const mode = view.view_opts_replication_mode === 'realtime' ? 'realtime' : 'materialized';
            return await jobs.insert({
                relation_id: view.id,
                enabled: true,
                mode,
                state: 'idle',
                slot_id: mode === 'realtime' ? `lq_sync_${view.id}` : null,
                last_seen_commit: null,
                last_success_at: null,
                last_error: null,
                retry_count: 0,
                next_retry_at: null,
                lease_owner: null,
                lease_expires_at: null,
                updated_at: now,
                engine_attrs: null,
            }, { systemTag: SYSTEM_TAG });
        }, { inputTx });
    }

    async #updateJob(relationId, patch, { inputTx, ensureWith = null } = {}) {
        if (ensureWith) {
            await this.#ensureJob(ensureWith, { inputTx });
        }

        await this.#transaction(async (tx) => {
            const jobs = tx.getRelation({ namespace: 'sys', name: 'sys_insync_jobs' });
            const row = jobs.get({ relation_id: relationId }, { using: 'sys_insync_jobs__relation_id_idx' });
            if (row) {
                await jobs.update(row, patch, { systemTag: SYSTEM_TAG });
            }
        }, { inputTx });
    }

    async #handleRealtimeCommit(view, commit, { inputTx = null } = {}) {
        try {
            await this.#transaction(async (tx) => {
                await tx.getRelation({ namespace: view.namespace, name: view.name }, { assertIsView: true }).applyUpstreamCommit(commit);
            }, { inputTx });

            await this.#updateJob(view.id, {
                state: 'running',
                last_seen_commit: commit.commitTime,
                last_error: null,
                updated_at: Date.now(),
            }, { inputTx });
        } catch (e) {
            this.#emitIssue(e, { phase: 'realtime', relation_id: view.id });
            try {
                await this.#updateJob(view.id, {
                    state: 'failed',
                    last_error: String(e?.message || e),
                    updated_at: Date.now(),
                }, { inputTx });
            } catch { }
        }
    }

    async #materializeView(view, { inputTx } = {}) {
        const job = await this.#ensureJob(view, { inputTx });
        await this.#updateJob(view.id, {
            enabled: true,
            state: 'running',
            mode: 'materialized',
            last_error: null,
            updated_at: Date.now(),
        }, { inputTx });

        try {
            const sourceClient = await this.#storageEngine.getEffectiveClient(view);
            const result = await sourceClient.query(view.source_expr_ast, { tx: sourceClient.storageEngine === this.#storageEngine ? inputTx : null });
            const rows = result.rows;

            await this.#transaction(async (tx) => {
                await tx.getRelation({ namespace: view.namespace, name: view.name }, { assertIsView: true }).applyUpstreamCommit({ type: 'result', rows });
            }, { inputTx });

            await this.#updateJob(view.id, {
                state: 'synced',
                last_success_at: Date.now(),
                last_error: null,
                retry_count: 0,
                updated_at: Date.now(),
            }, { inputTx });
        } catch (e) {
            await this.#updateJob(view.id, {
                state: 'failed',
                last_error: String(e?.message || e),
                retry_count: (job?.retry_count || 0) + 1,
                updated_at: Date.now(),
            }, { inputTx });
            throw e;
        }
    }

    async #startRealtimeView(view, { forceSync = true, inputTx = null } = {}) {
        let wasSyncingWithTx = false;

        if (this.#activeRealtimeJobs.has(view.id)) {
            if (!forceSync) return;

            wasSyncingWithTx = inputTx;
            const sub = this.#activeRealtimeJobs.get(view.id);
            this.#activeRealtimeJobs.delete(view.id);
            await sub.abort();
        }

        const baseJob = await this.#ensureJob(view, { inputTx });
        const slotId = baseJob.slot_id || `lq_sync_${view.id}`;

        await this.#updateJob(view.id, {
            enabled: true,
            state: 'running',
            mode: 'realtime',
            slot_id: slotId,
            last_error: null,
            updated_at: Date.now(),
        }, { inputTx });

        const sourceClient = await this.#storageEngine.getEffectiveClient(view);
        const replicationAttrs = view.view_mode_replication_attrs;

        const upstreamRelation = replicationAttrs.mapping_level === 'table'
            ? replicationAttrs.upstream_relation
            : null;
        const upstreamMvccKey = replicationAttrs.effective_upstream_mvcc_key;
        const upstreamMvccKey_isXMIN = upstreamMvccKey?.toUpperCase() === 'XMIN';

        try {
            let upstreamSub;
            if (upstreamRelation && (!upstreamMvccKey || upstreamMvccKey_isXMIN)) {
                await this.#materializeView(view, { inputTx });

                const selector = { [upstreamRelation.namespace]: [upstreamRelation.name] };

                upstreamSub = await sourceClient.wal.subscribe(selector, async (commit) => {
                    await this.#handleRealtimeCommit(view, commit, { inputTx });
                }, { id: slotId });

                this.#activeRealtimeJobs.set(view.id, upstreamSub);
            } else {
                const rtResult = await sourceClient.query(view.source_expr_ast, async (commit) => {
                    await this.#handleRealtimeCommit(view, commit, { inputTx });
                }, { live: true, id: slotId });

                if (rtResult.initial) {
                    await this.#transaction(async (tx) => {
                        await tx.getRelation({ namespace: view.namespace, name: view.name }, { assertIsView: true })
                            .applyUpstreamCommit({ type: 'result', rows: rtResult.rows, hashes: rtResult.hashes });
                    }, { inputTx });
                }

                upstreamSub = rtResult;
                this.#activeRealtimeJobs.set(view.id, upstreamSub);
            }

            upstreamSub.on('error', async (error) => {
                this.#activeRealtimeJobs.delete(view.id);
                await this.#updateJob(view.id, {
                    state: 'idle',
                    last_error: error?.message || String(error),
                    updated_at: Date.now(),
                }, { inputTx });
                this.#emitIssue(new Error('Upstream replication connection lost'), { phase: 'realtime', relation_id: view.id });
            });

            if (inputTx) {
                inputTx.addUndo(async () => {
                    await upstreamSub.abort();
                    this.#activeRealtimeJobs.delete(view.id);
                    if (wasSyncingWithTx !== false) {
                        await this.#startRealtimeView(view, { inputTx: wasSyncingWithTx });
                    }
                });
            }

            await this.#updateJob(view.id, {
                mode: 'realtime',
                state: 'running',
                last_error: null,
                updated_at: Date.now(),
            }, { inputTx });
        } catch (e) {
            await this.#updateJob(view.id, {
                state: 'failed',
                last_error: String(e?.message || e),
                retry_count: (baseJob?.retry_count || 0) + 1,
                updated_at: Date.now(),
            }, { inputTx });
            throw e;
        }
    }

}
