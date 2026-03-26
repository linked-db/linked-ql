import { matchRelationSelector, normalizeRelationSelectorArg } from '../clients/abstracts/util.js';
import { ConflictError } from './ConflictError.js';
import { SYSTEM_TAG } from './storage/TableStorage.js';

export class SyncManager {

    #storageEngine;
    #activeRealtimeJobs = new Map;
    #queuedSyncSelector = null;
    #syncDrainPromise = null;

    constructor(storageEngine) {
        this.#storageEngine = storageEngine;
    }

    async sync(selector = '*') {
        this.#queuedSyncSelector = this.#mergeSelectors(this.#queuedSyncSelector, selector);
        if (!this.#syncDrainPromise) {
            this.#syncDrainPromise = this.#drainSyncQueue();
        }
        return await this.#syncDrainPromise;
    }

    async #drainSyncQueue() {
        const summary = { materialized: [], realtime: [], failed: [] };

        try {
            while (this.#queuedSyncSelector !== null) {
                const selector = this.#queuedSyncSelector;
                this.#queuedSyncSelector = null;
                this.#mergeSummary(summary, await this.#runSync(selector));
            }
            return summary;
        } finally {
            this.#syncDrainPromise = null;
            if (this.#queuedSyncSelector !== null) {
                this.#syncDrainPromise = this.#drainSyncQueue();
            }
        }
    }

    async #runSync(selector = '*') {
        const summary = { materialized: [], realtime: [], failed: [] };
        const views = await this.#resolveViews(selector);

        for (const view of views) {
            try {
                const job = await this.#ensureJob(view);
                if (!job.enabled) continue;

                if (view.persistence === 'materialized') {
                    // Materialized views are one-off jobs; rerun only when missing/failure state.
                    if (job.state !== 'synced' || !job.last_success_at) {
                        await this.#materializeView(view);
                        summary.materialized.push(view.id);
                    }
                }

                if (view.persistence === 'realtime') {
                    await this.#startRealtimeView(view, { force: false });
                    summary.realtime.push(view.id);
                }
            } catch (e) {
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

    async start(selector = '*') {
        const summary = { realtime: [], failed: [] };
        const views = await this.#resolveViews(selector);

        for (const view of views) {
            if (view.persistence !== 'realtime') continue;
            try {
                await this.#updateJob(view.id, {
                    enabled: true,
                    state: 'idle',
                    updated_at: Date.now(),
                }, { ensureWith: view });

                await this.#startRealtimeView(view, { force: false });
                summary.realtime.push(view.id);
            } catch (e) {
                summary.failed.push({ relation_id: view.id, error: String(e?.message || e) });
            }
        }

        return summary;
    }

    async stop(selector = '*', { disable = true } = {}) {
        const views = await this.#resolveViews(selector);
        const stopped = [];

        for (const view of views) {
            if (view.persistence !== 'realtime') continue;

            const abortLine = this.#activeRealtimeJobs.get(view.id);
            if (abortLine) {
                this.#activeRealtimeJobs.delete(view.id);
                await abortLine();
            }

            await this.#updateJob(view.id, {
                state: 'idle',
                enabled: disable ? false : true,
                updated_at: Date.now(),
            }, { ensureWith: view });
            stopped.push(view.id);
        }

        return { stopped };
    }

    async resume(selector = '*') {
        const views = await this.#resolveViews(selector);
        const resumed = [];

        for (const view of views) {
            const job = await this.#ensureJob(view);
            if (job.enabled) continue;

            await this.#updateJob(view.id, {
                enabled: true,
                state: 'idle',
                updated_at: Date.now(),
            });
            resumed.push(view.id);
        }

        const synced = resumed.length
            ? await this.sync((view) => resumed.includes(view.id))
            : { materialized: [], realtime: [], failed: [] };

        return { resumed, ...synced };
    }

    async status(selector = '*') {
        const views = await this.#resolveViews(selector);
        if (!views.length) return [];

        return await this.#storageEngine.transaction(async (tx) => {
            const jobs = tx.getTable({ namespace: 'sys', name: 'sys_sync_jobs' });
            return views.map((view) => {
                const job = jobs.get({ relation_id: view.id }, { using: 'sys_sync_jobs__relation_id_idx' });
                return {
                    relation_id: view.id,
                    namespace: view.namespace,
                    name: view.name,
                    persistence: view.persistence,
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
        });
    }

    async shutdown() {
        for (const [relationId, abortLine] of this.#activeRealtimeJobs.entries()) {
            this.#activeRealtimeJobs.delete(relationId);
            await abortLine();
        }
    }

    async #resolveViews(selector = '*') {
        const selectorFn = typeof selector === 'function' ? selector : null;
        const selectorMap = selectorFn ? null : normalizeRelationSelectorArg(selector);

        return await this.#storageEngine.transaction(async (tx) => {
            const views = tx.listViews(true);
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
        });
    }

    async #ensureJob(view) {
        const now = Date.now();
        return await this.#storageEngine.transaction(async (tx) => {
            const jobs = tx.getTable({ namespace: 'sys', name: 'sys_sync_jobs' });
            const existing = jobs.get({ relation_id: view.id }, { using: 'sys_sync_jobs__relation_id_idx' });
            if (existing) return existing;

            const mode = view.persistence === 'realtime' ? 'realtime' : 'materialized';
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
        });
    }

    async #updateJob(relationId, patch, { ensureWith = null } = {}) {
        if (ensureWith) {
            await this.#ensureJob(ensureWith);
        }
        await this.#storageEngine.transaction(async (tx) => {
            const jobs = tx.getTable({ namespace: 'sys', name: 'sys_sync_jobs' });
            const row = jobs.get({ relation_id: relationId }, { using: 'sys_sync_jobs__relation_id_idx' });
            if (!row) return;
            await jobs.update(row, patch);
        });
    }

    async #materializeView(view) {
        const job = await this.#ensureJob(view);
        await this.#updateJob(view.id, {
            enabled: true,
            state: 'running',
            mode: 'materialized',
            last_error: null,
            updated_at: Date.now(),
        });

        try {
            const sourceClient = await this.#resolveSourceClient(view);
            const querySpec = this.#toQuerySpec(view);
            const result = await sourceClient.query(querySpec);
            const rows = result?.rows || [];

            await this.#replaceAllRows(view, rows);

            await this.#updateJob(view.id, {
                state: 'synced',
                last_success_at: Date.now(),
                last_error: null,
                retry_count: 0,
                updated_at: Date.now(),
            });
        } catch (e) {
            await this.#updateJob(view.id, {
                state: 'failed',
                last_error: String(e?.message || e),
                retry_count: (job?.retry_count || 0) + 1,
                updated_at: Date.now(),
            });
            throw e;
        }
    }

    async #startRealtimeView(view, { force = true } = {}) {
        if (this.#activeRealtimeJobs.has(view.id)) {
            if (!force) return;
            const abortLine = this.#activeRealtimeJobs.get(view.id);
            this.#activeRealtimeJobs.delete(view.id);
            await abortLine();
        }

        const baseJob = await this.#ensureJob(view);
        const slotId = baseJob.slot_id || `lq_sync_${view.id}`;

        await this.#updateJob(view.id, {
            enabled: true,
            state: 'running',
            mode: 'realtime',
            slot_id: slotId,
            last_error: null,
            updated_at: Date.now(),
        });

        const sourceClient = await this.#resolveSourceClient(view);
        const querySpec = this.#toQuerySpec(view);
        const isQueryBased = !!view.view_spec?.query || !!view.view_spec?.filters;

        try {
            if (isQueryBased) {
                const rtResult = await sourceClient.query(querySpec, async (commit) => {
                    await this.#applyQueryBasedCommit(view, commit);
                    if (Number.isInteger(commit?.commitTime)) {
                        await this.#updateJob(view.id, {
                            state: 'running',
                            last_seen_commit: commit.commitTime,
                            last_error: null,
                            updated_at: Date.now(),
                        });
                    }
                }, { live: true, id: slotId });

                if (rtResult.mode !== 'streaming_only') {
                    await this.#replaceAllRows(view, (rtResult.rows || []).map((row, i) => ({ __id: rtResult.hashes[i], ...row })));
                }

                this.#activeRealtimeJobs.set(view.id, async () => {
                    await rtResult.abort();
                });
            } else {
                await this.#materializeView(view);

                const sourceNs = view.view_spec?.namespace || view.namespace;
                const sourceName = view.view_spec?.name;
                const selector = { [sourceNs]: [sourceName] };

                const unsubscribe = await sourceClient.wal.subscribe(selector, async (commit) => {
                    await this.#applyReferenceCommit(view, commit);
                    if (Number.isInteger(commit?.commitTime)) {
                        await this.#updateJob(view.id, {
                            state: 'running',
                            last_seen_commit: commit.commitTime,
                            last_error: null,
                            updated_at: Date.now(),
                        });
                    }
                }, { id: slotId });

                this.#activeRealtimeJobs.set(view.id, async () => {
                    await unsubscribe();
                });
            }

            await this.#updateJob(view.id, {
                mode: 'realtime',
                state: 'running',
                last_error: null,
                updated_at: Date.now(),
            });
        } catch (e) {
            await this.#updateJob(view.id, {
                state: 'failed',
                last_error: String(e?.message || e),
                retry_count: (baseJob?.retry_count || 0) + 1,
                updated_at: Date.now(),
            });
            throw e;
        }
    }

    async #resolveSourceClient(view) {
        return await this.#storageEngine.getSourceClient(view.namespaceDef);
    }

    #toQuerySpec(view) {
        const spec = { ...(view.view_spec || {}) };
        if (!spec.name && !spec.query) {
            throw new Error(`View ${view.namespace}.${view.name} has invalid view_spec`);
        }
        if (!spec.query) {
            spec.namespace = spec.namespace || view.namespace;
        }
        return spec;
    }

    async #replaceAllRows(view, rows) {
        await this.#storageEngine.transaction(async (tx) => {
            await tx.resetView({ namespace: view.namespace, name: view.name });
            const tableStorage = tx.getTable({ namespace: view.namespace, name: view.name }, { assertIsView: true });
            for (const row of rows) {
                await tableStorage.insert(row, { systemTag: SYSTEM_TAG });
            }
        }, { meta: { source: 'sync' } });
    }

    async #applyQueryBasedCommit(view, commit) {
        if (!commit || !commit.type) return;

        if (commit.type === 'result') {
            const rows = (commit.rows || []).map((row, i) => ({ __id: commit.hashes?.[i], ...row }));
            await this.#replaceAllRows(view, rows);
            return;
        }

        if (commit.type !== 'diff' || !Array.isArray(commit.entries)) return;

        await this.#storageEngine.transaction(async (tx) => {
            const tableStorage = tx.getTable({ namespace: view.namespace, name: view.name }, { assertIsView: true });

            for (const event of commit.entries) {
                if (event.op === 'insert' && event.new) {
                    const row = { __id: event.newHash, ...event.new };
                    try {
                        await tableStorage.insert(row, { systemTag: SYSTEM_TAG });
                    } catch (e) {
                        if (!(e instanceof ConflictError)) throw e;
                        await tableStorage.update({ __id: event.newHash }, row, { systemTag: SYSTEM_TAG });
                    }
                } else if (event.op === 'update' && event.new) {
                    const oldKey = { __id: event.oldHash };
                    const newRow = { __id: event.newHash, ...event.new };
                    try {
                        await tableStorage.update(oldKey, newRow, { systemTag: SYSTEM_TAG });
                    } catch {
                        await tableStorage.insert(newRow, { systemTag: SYSTEM_TAG });
                    }
                } else if (event.op === 'delete' && event.oldHash) {
                    try {
                        await tableStorage.delete({ __id: event.oldHash });
                    } catch {
                        // no-op
                    }
                }
            }
        }, { meta: { source: 'sync' } });
    }

    async #applyReferenceCommit(view, commit) {
        if (!commit || commit.computed || !Array.isArray(commit.entries)) return;

        await this.#storageEngine.transaction(async (tx) => {
            const tableStorage = tx.getTable({ namespace: view.namespace, name: view.name }, { assertIsView: true });

            for (const event of commit.entries) {
                if (event.op === 'insert' && event.new) {
                    try {
                        await tableStorage.insert(event.new);
                    } catch (e) {
                        if (!(e instanceof ConflictError)) throw e;
                        const key = this.#extractKey(event, event.new);
                        await tableStorage.update(key, event.new);
                    }
                } else if (event.op === 'update' && event.new) {
                    const oldRef = event.old || event.oldKey || this.#extractKey(event, event.new);
                    try {
                        await tableStorage.update(oldRef, event.new);
                    } catch {
                        await tableStorage.insert(event.new);
                    }
                } else if (event.op === 'delete') {
                    const oldRef = event.old || event.oldKey;
                    if (!oldRef) continue;
                    try {
                        await tableStorage.delete(oldRef);
                    } catch {
                        // no-op
                    }
                }
            }
        }, { meta: { source: 'sync' } });
    }

    #extractKey(event, fallbackRow = null) {
        const keyCols = event.relation?.keyColumns || [];
        if (!keyCols.length || !fallbackRow) return fallbackRow;
        return Object.fromEntries(keyCols.map((k) => [k, fallbackRow[k]]));
    }
}
