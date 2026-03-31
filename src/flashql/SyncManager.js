import { SimpleEmitter } from '../clients/abstracts/SimpleEmitter.js';
import { matchRelationSelector, normalizeRelationSelectorArg } from '../clients/abstracts/util.js';
import { SYSTEM_TAG } from './storage/TableStorage.js';

export class SyncManager extends SimpleEmitter {

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

    async sync(selector = '*', { forceSync = false, tx: inputTx = null } = {}) {
        this.#queuedSyncSelector = this.#mergeSelectors(this.#queuedSyncSelector, selector);
        if (!this.#syncDrainPromise) {
            this.#syncDrainPromise = this.#drainSyncQueue({ forceSync, inputTx });
        }
        return await this.#syncDrainPromise;
    }

    async #drainSyncQueue({ forceSync = false, inputTx = null }) {
        const summary = { materialized: [], realtime: [], failed: [] };
        try {
            while (this.#queuedSyncSelector !== null) {
                const selector = this.#queuedSyncSelector;
                this.#queuedSyncSelector = null;
                this.#mergeSummary(summary, await this.#runSync(selector, { forceSync, inputTx }));
            }
            return summary;
        } catch (e) {
            this.emit('error', e);
            throw e;
        } finally {
            this.#syncDrainPromise = null;
            if (this.#queuedSyncSelector !== null) {
                this.#syncDrainPromise = this.#drainSyncQueue({ inputTx });
            }
        }
    }

    async #runSync(selector = '*', { forceSync, inputTx }) {
        const summary = { materialized: [], realtime: [], failed: [] };
        const views = await this.#resolveViews(selector, { inputTx });

        for (const view of views) {
            try {
                const job = await this.#ensureJob(view, { inputTx });
                if (!job.enabled) continue;

                if (view.view_opts_replication_mode === 'materialized') {
                    // Materialized views are one-off jobs; rerun only when missing/failure state.
                    if (job.state !== 'synced' || !job.last_success_at || forceSync) {
                        await this.#materializeView(view, { inputTx });
                        summary.materialized.push(view.id);
                    }
                }

                if (view.view_opts_replication_mode === 'realtime') {
                    await this.#startRealtimeView(view, { forceSync, inputTx });
                    summary.realtime.push(view.id);
                }
            } catch (e) {
                this.emit('error', e);
                console.log('____', e);
                summary.failed.push({ relation_id: view.id, error: String(e?.message || e) });
            }
        }

        return summary;
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

                await this.#startRealtimeView(view, { forceSync });
                summary.realtime.push(view.id);
            } catch (e) {
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

            const abortLine = this.#activeRealtimeJobs.get(view.id);
            if (abortLine) {
                this.#activeRealtimeJobs.delete(view.id);
                await abortLine();
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
            const jobs = tx.getTable({ namespace: 'sys', name: 'sys_sync_jobs' });
            return views.map((view) => {
                const job = jobs.get({ relation_id: view.id }, { using: 'sys_sync_jobs__relation_id_idx' });
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
        const abortLine = this.#activeRealtimeJobs.get(view.id);
        if (abortLine) {
            this.#activeRealtimeJobs.delete(view.id);
            await abortLine();
        }

        // Execute forget first
        if (view.view_opts_replication_mode === 'realtime') {
            const sourceClient = await this.#storageEngine.getSourceClient(view);
            const pureRefDecode = this.#storageEngine._viewSourceExprIsPureRef(view);

            const slotId = `lq_sync_${view.id}`;
            if (pureRefDecode) {
                await sourceClient.wal.forget(slotId);
            } else await sourceClient.live.forget(slotId);
        }

        // Delete local job entry
        return await this.#transaction(async (tx) => {
            const jobs = tx.getTable({ namespace: 'sys', name: 'sys_sync_jobs' });
            return await jobs.delete({ relation_id: view.id }, { using: 'sys_sync_jobs__relation_id_idx' });
        }, { inputTx });
    }

    async shutdown() {
        for (const [relationId, abortLine] of this.#activeRealtimeJobs.entries()) {
            this.#activeRealtimeJobs.delete(relationId);
            await abortLine();
        }
    }

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
            const jobs = tx.getTable({ namespace: 'sys', name: 'sys_sync_jobs' });
            const existing = jobs.get({ relation_id: view.id }, { using: 'sys_sync_jobs__relation_id_idx' });
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
            });
        }, { inputTx });
    }

    async #updateJob(relationId, patch, { inputTx, ensureWith = null } = {}) {
        if (ensureWith) {
            await this.#ensureJob(ensureWith, { inputTx });
        }

        await this.#transaction(async (tx) => {
            const jobs = tx.getTable({ namespace: 'sys', name: 'sys_sync_jobs' });
            const row = jobs.get({ relation_id: relationId }, { using: 'sys_sync_jobs__relation_id_idx' });
            if (row) {
                await jobs.update(row, patch);
            }
        }, { inputTx });
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
            const sourceClient = await this.#storageEngine.getSourceClient(view);
            const result = await sourceClient.query(view.source_expr_ast, { tx: sourceClient.storageEngine === this.#storageEngine ? inputTx : null });
            const rows = result.rows;

            await this.#replaceAllRows(view, rows, { inputTx });

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
            const abortLine = this.#activeRealtimeJobs.get(view.id);
            this.#activeRealtimeJobs.delete(view.id);
            await abortLine();
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

        const sourceClient = await this.#storageEngine.getSourceClient(view);
        const pureRefDecode = this.#storageEngine._viewSourceExprIsPureRef(view);
        try {
            let abortLine;
            if (pureRefDecode) {
                await this.#materializeView(view, { inputTx });

                const selector = { [pureRefDecode.namespace]: [pureRefDecode.name] };

                abortLine = await sourceClient.wal.subscribe(selector, async (commit) => {
                    await this.#applyReferenceCommit(view, commit, { inputTx });
                    await this.#updateJob(view.id, {
                        state: 'running',
                        last_seen_commit: commit.commitTime,
                        last_error: null,
                        updated_at: Date.now(),
                    }, { inputTx });
                }, { id: slotId });

                this.#activeRealtimeJobs.set(view.id, abortLine);
            } else {
                const rtResult = await sourceClient.query(view.source_expr_ast, async (commit) => {
                    await this.#applyQueryBasedCommit(view, commit, { inputTx });
                    await this.#updateJob(view.id, {
                        state: 'running',
                        last_seen_commit: commit.commitTime,
                        last_error: null,
                        updated_at: Date.now(),
                    }, { inputTx });
                }, { live: true, id: slotId });

                if (rtResult.mode !== 'streaming_only') {
                    await this.#replaceAllRows(view, rtResult.rows.map((row, i) => ({ __id: rtResult.hashes[i], ...row })), { inputTx });
                }

                abortLine = async () => await rtResult.abort();
                this.#activeRealtimeJobs.set(view.id, abortLine);
            }

            if (inputTx) {
                inputTx.addUndo(async () => {
                    await abortLine();
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
            this.emit('error', e);
            await this.#updateJob(view.id, {
                state: 'failed',
                last_error: String(e?.message || e),
                retry_count: (baseJob?.retry_count || 0) + 1,
                updated_at: Date.now(),
            }, { inputTx });
            throw e;
        }
    }

    async #replaceAllRows(view, rows, { inputTx = null } = {}) {
        await this.#transaction(async (tx) => {
            await tx.resetView({ namespace: view.namespace, name: view.name }, { syncForget: false });
            const tableStorage = tx.getTable({ namespace: view.namespace, name: view.name }, { assertIsView: true });
            for (const row of rows) {
                await tableStorage.insert(row, { systemTag: SYSTEM_TAG });
            }
        }, { meta: { source: 'sync' }, inputTx });
    }

    async #applyQueryBasedCommit(view, commit, { inputTx }) {
        if (!commit || !commit.type) return;

        if (commit.type === 'result') {
            const rows = (commit.rows || []).map((row, i) => ({ __id: commit.hashes[i], ...row }));
            await this.#replaceAllRows(view, rows, { inputTx });
            return;
        }

        if (commit.type !== 'diff' || !Array.isArray(commit.entries)) return;

        await this.#transaction(async (tx) => {
            const tableStorage = tx.getTable({ namespace: view.namespace, name: view.name }, { assertIsView: true });

            for (const event of commit.entries) {
                if (event.op === 'insert') {
                    const row = { __id: event.newHash, ...event.new };
                    await tableStorage.upsert(row, { systemTag: SYSTEM_TAG });
                } else if (event.op === 'update') {
                    const oldKey = { __id: event.oldHash };
                    const newRow = { __id: event.newHash, ...event.new };
                    const updated = await tableStorage.update(oldKey, newRow, { systemTag: SYSTEM_TAG });
                    if (!updated) await tableStorage.insert(newRow, { systemTag: SYSTEM_TAG });
                } else if (event.op === 'delete') {
                    await tableStorage.delete({ __id: event.oldHash });
                }
            }
        }, { meta: { source: 'sync' }, inputTx });
    }

    async #applyReferenceCommit(view, commit, { inputTx }) {
        if (!commit || commit.computed || !Array.isArray(commit.entries)) return;

        await this.#transaction(async (tx) => {
            const tableStorage = tx.getTable({ namespace: view.namespace, name: view.name }, { assertIsView: true });

            for (const event of commit.entries) {
                if (event.op === 'insert') {
                    await tableStorage.upsert(event.new);
                } else if (event.op === 'update') {
                    const oldRef = event.old || event.oldKey;
                    const updated = await tableStorage.update(oldRef, event.new);
                    if (!updated) await tableStorage.insert(event.new);
                } else if (event.op === 'delete') {
                    const oldRef = event.old || event.oldKey;
                    await tableStorage.delete(oldRef);
                }
            }
        }, { meta: { source: 'sync' }, inputTx });
    }
}
