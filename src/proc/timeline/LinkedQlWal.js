import { normalizeRelationSelectorArg } from '../../clients/abstracts/util.js';
import { SYSTEM_TAG } from '../SYSTEM.js';

const E_PATTERNS = Symbol('patterns');
const ALL_MATCH = '["*","*"]';

export class LinkedQlWal {

    #linkedQlClient;
    #drainMode;
    #lifecycleHook;

    #commitsKV;
    #metaKV;
    #slotsKV;

    #subscribers = new Map();

    #drainScheduled = false;
    #draining = false;

    get linkedQlClient() { return this.#linkedQlClient; }

    constructor({ linkedQlClient, keyval = new Map, drainMode = 'drain', lifecycleHook = null } = {}) {
        this.#drainMode = drainMode;
        this.#linkedQlClient = linkedQlClient;
        this.#lifecycleHook = lifecycleHook;

        if (typeof keyval?.enter === 'function') {
            this.#commitsKV = keyval.enter('commits');
            this.#metaKV = keyval.enter('meta');
            this.#slotsKV = keyval.enter('slots');
        } else if (keyval instanceof Map) {
            this.#commitsKV = new Map();
            this.#metaKV = new Map();
            this.#slotsKV = new Map();

            keyval.set('commits', this.#commitsKV);
            keyval.set('meta', this.#metaKV);
            keyval.set('slots', this.#slotsKV);
        } else {
            throw new Error('keyval must be a Map or implement the Map-like keyval.enter(namespace) interface');
        }
    }

    async close({ destroy = false } = {}) {
        this.#subscribers.clear();
        if (destroy) {
            await this.#commitsKV.clear();
            await this.#metaKV.clear();
            await this.#slotsKV.clear();
        }
    }

    // ----------- streaming

    async hasSlot(slotName) {
        return await this.#slotsKV.has(slotName);
    }

    async latestCommit() {
        return await this.#metaKV.get('latestCommit');
    }

    async * streamCommits({ start = null, end = null } = {}) {
        const CHUNK_SIZE = 100;
        let cursor = 0;

        for (const [commitTime, commit] of await this.#commitsKV.entries()) {
            if (start && commitTime < start) continue;

            yield commit;

            if (end && commitTime >= end) break;
            if (cursor++ % CHUNK_SIZE === 0) {
                await new Promise(r => _setImmediate(r));
            }
        }
    }

    async #appendCommit(commit) {
        await this.#commitsKV.set(commit.commitTime, commit);
        await this.#metaKV.set('latestCommit', commit.commitTime);
    }

    async truncateForward(commitTime) {
        if (!Number.isInteger(commitTime) || commitTime < 0) {
            throw new TypeError('truncateForward(commitTime): commitTime must be a non-negative integer');
        }

        let deleted = 0;
        for (const persistedCommitTime of await this.#commitsKV.keys()) {
            if (persistedCommitTime > commitTime) {
                await this.#commitsKV.delete(persistedCommitTime);
                deleted++;
            }
        }

        let latestCommit = null;
        for (const persistedCommitTime of await this.#commitsKV.keys()) {
            if (!Number.isInteger(latestCommit) || persistedCommitTime > latestCommit) {
                latestCommit = persistedCommitTime;
            }
        }

        if (Number.isInteger(latestCommit)) {
            await this.#metaKV.set('latestCommit', latestCommit);
        } else {
            await this.#metaKV.delete('latestCommit');
        }

        for (const [slotName, slot] of await this.#slotsKV.entries()) {
            if (Number.isInteger(slot?.lastSeenCommit)
                && (!Number.isInteger(latestCommit) || slot.lastSeenCommit > latestCommit)) {
                await this.#slotsKV.set(slotName, { ...slot, lastSeenCommit: latestCommit });
            }
        }

        return { deleted, latestCommit };
    }

    // ----------- subscription

    async subscribe(selector = '*', cb, _options = {}) {
        if (typeof selector === 'function') {
            [_options, cb, selector] = [cb || {}, selector, '*'];
        }
        const { tx = null, liveQueryOriginated, isSingleTableLiveQuery, ...options } = _options;

        const selectorSet = normalizeRelationSelectorArg(selector, true);
        const { id: slotName = null } = options;

        const sub = {
            id: slotName || Symbol('ephemeral_id'),
            selector,
            selectorSet,
            cb,
            tx,
            liveQueryOriginated: liveQueryOriginated === SYSTEM_TAG,
            isSingleTableLiveQuery: liveQueryOriginated === SYSTEM_TAG && isSingleTableLiveQuery,
            lastSeenCommit: null,
            catchingUp: !!slotName,
            queue: []
        };

        // Can beging recieving events (in queue)
        // ahead of catchup lookup
        this.#subscribers.set(sub.id, sub);
        if (this.#subscribers.size === 1 && this.#lifecycleHook) {
            await this.#lifecycleHook(1);
        }

        if (typeof sub.id !== 'symbol') {
            const existing = await this.#slotsKV.get(slotName);
            if (existing) {
                sub.lastSeenCommit = existing.lastSeenCommit;
            } else {
                await this.#checkpoint(sub);
            }

            if (sub.lastSeenCommit) {
                const latestCommit = await this.latestCommit();
                if (latestCommit && sub.lastSeenCommit < latestCommit) {
                    await this.#runCatchup(sub, latestCommit);
                }
            }

            await this.#flushQueue(sub);
            sub.catchingUp = false; // Must come after

            if (this.#drainMode === 'drain') {
                this.#scheduleDrain();
            }
        }

        return async ({ forget = false } = {}) => {
            let existed = this.#subscribers.has(sub.id);
            this.#subscribers.delete(sub.id);

            if (forget) existed = await this.forget(sub.id);
            else await this.#callLifecycleHookIf();

            return existed;
        };
    }

    async forget(id) {
        if (typeof id === 'symbol') return false;

        const existed = (await this.#slotsKV.delete(id), true);
        // TODO: KV.delete() does not yet return a bool on delete

        if (existed && this.#drainMode === 'drain') {
            this.#scheduleDrain();
        }

        await this.#callLifecycleHookIf();

        return existed;
    }

    async #callLifecycleHookIf() {
        if (!this.#lifecycleHook) return;
        if (this.#subscribers.size) return;

        const cantTerminate = this.#drainMode === 'never'
            || this.#drainMode === 'drain' && (
                this.#slotsKV instanceof Map
                    ? this.#slotsKV.size
                    : await this.#slotsKV.count()
            );
        if (cantTerminate) return;

        await this.#lifecycleHook(0);
    }

    // ----------- applying

    async applyDownstreamCommit(commit, options = {}) {
        throw new Error('LinkedQlWal.applyDownstreamCommit() is not implemented by this adapter');
    }

    // ----------- dispatcher

    async dispatch(commit) {
        // 1. Persist commit?
        const shouldPersist = this.#drainMode === 'never'
            || this.#drainMode === 'drain' && (
                this.#slotsKV instanceof Map
                    ? this.#slotsKV.size
                    : await this.#slotsKV.count()
            );

        if (shouldPersist) {
            if (commit.type === 'result' && this.#drainMode === 'drain') {
                // Move every slot forward and drain history
                const latestCommit = await this.latestCommit();

                for (const id of await this.#slotsKV.keys()) {
                    const sub = this.#subscribers.get(id);
                    // If not online or is catching up, ignore
                    if (!sub || sub.catchingUp) continue;

                    sub.lastSeenCommit = latestCommit;
                    await this.#checkpoint(sub);
                }

                this.#scheduleDrain();
            }
            await this.#appendCommit(commit);
        }

        // No one online?
        if (!this.#subscribers.size) return;

        const proms = [];

        if (!commit.computed) {
            for (const e of commit.entries) {
                e[E_PATTERNS] = [
                    JSON.stringify([e.relation.namespace, e.relation.name]),
                    JSON.stringify(['*', e.relation.name]),
                    JSON.stringify([e.relation.namespace, '*']),
                    ALL_MATCH
                ];
            }
        }

        // 2. Deliver to online subscribers
        for (const sub of this.#subscribers.values()) {
            proms.push(this.#dispatchTo(sub, commit));
        }

        // 3. Drain
        if (this.#drainMode === 'drain') {
            this.#scheduleDrain();
        }

        await Promise.all(proms);
    }

    async #dispatchTo(sub, commit, isCatchupCall = false) {
        if (sub.catchingUp && !isCatchupCall) {
            sub.queue.push(commit);
            return true;
        }

        // No more online?
        if (!this.#subscribers.has(sub.id)) return false;

        const _matchedCommit = this.#filterEvents(commit, sub);
        const matchedCommit = await this.#filterEvents2(_matchedCommit, sub);
        if (!matchedCommit) return true;

        await sub.cb(matchedCommit);

        if (typeof sub.id !== 'symbol') {
            sub.lastSeenCommit = commit.commitTime;
            await this.#checkpoint(sub);
        }

        return true;
    }

    #filterEvents(commit, sub) {
        if (sub.selectorSet.has(ALL_MATCH)) {
            return structuredClone(commit);
        }

        // Computed commits only honour ALL_MATCH
        if (commit.computed) return null;

        const entries = commit.entries.filter((e) => {
            const patterns = e[E_PATTERNS] || [
                JSON.stringify([e.relation.namespace, e.relation.name]),
                JSON.stringify(['*', e.relation.name]),
                JSON.stringify([e.relation.namespace, '*']),
                ALL_MATCH,
            ];
            for (const p of patterns) {
                if (sub.selectorSet.has(p)) return true;
            }
            return false;
        }).map((e) => structuredClone(e));

        if (!entries.length) return null;

        return { ...commit, entries };
    }

    async #filterEvents2(commit, sub) {
        if (!commit) return null;

        if (sub.liveQueryOriginated && !this.#linkedQlClient?.options.centralizeCommitVisibility) {
            // The live query has an operational model that when combined wuth transactions
            // automatically addresses visibility and security.
            // centralizeCommitVisibility says to at least sill intercept those
             return commit;
        }

        const resolveCommitVisibility = this.#linkedQlClient?.options.resolveCommitVisibility;
        if (!resolveCommitVisibility) {
            if (!sub.tx || sub.liveQueryOriginated) return commit;
            throw new Error(`Transaction-scoped subscriptions must be resolved within a linkedQlClient context with an options.resolveCommitVisibility() callback`);
        }

        const entries = commit.entries.map((entry) => Object.freeze({ ...entry }));
        const visibleEntries = await resolveCommitVisibility(
            Object.freeze(entries),
            { tx: sub.tx, liveQueryOriginated: sub.liveQueryOriginated }
        );

        if (!(visibleEntries === null || Array.isArray(visibleEntries)))
            throw new Error(`resolveCommitVisibility() callback must return either an array of entries or null for subscriptions`);

        if (sub.liveQueryOriginated) {
            // Null forces a requery within the live query engine
            if (visibleEntries === null) return { ...commit, isVisible: null };
            if (!visibleEntries.length) return null;
            return { ...commit, entries: visibleEntries, isVisible: SYSTEM_TAG };
        }

        if (!visibleEntries?.length) return null;
        return { ...commit, entries: visibleEntries };
    }

    // ----------- catch up

    async #runCatchup(sub, lastSeenCommitSnapshot) {
        for await (const commit of this.streamCommits({ start: sub.lastSeenCommit + 1, end: lastSeenCommitSnapshot })) {
            if (await this.#dispatchTo(sub, commit, true) === false) break;
        }
    }

    async #flushQueue(sub) {
        const CHUNK_SIZE = 100;

        for (let i = 0; i < sub.queue.length; i++) {
            const commit = sub.queue[i];

            if (await this.#dispatchTo(sub, commit, true) === false) break;

            if ((i + 1) % CHUNK_SIZE === 0) {
                await new Promise(r => _setImmediate(r));
            }
        }

        sub.queue.length = 0;
    }

    async #checkpoint(sub) {
        const slot = { selector: sub.selector, lastSeenCommit: sub.lastSeenCommit };
        await this.#slotsKV.set(sub.id, slot);
    }

    // ----------- draining

    #scheduleDrain() {
        if (this.#drainScheduled) return;
        this.#drainScheduled = true;

        _setImmediate(async () => {
            this.#drainScheduled = false;
            await this.#runDrain();
        });
    }

    async #runDrain() {
        if (this.#draining) return;

        const drainLimit = await this.#calculateMinLastSeen();
        if (!drainLimit) return;

        this.#draining = true;

        // Do draining here
        // TODO

        this.#draining = false;
    }

    async #calculateMinLastSeen() {
        let min = Infinity;
        for (const slot of await this.#slotsKV.values()) {
            min = Math.min(slot.lastSeenCommit || Infinity, min);
        }
        return min === Infinity ? null : min;
    }
}

const _setImmediate = (cb) => {
    if (typeof setImmediate === 'function') {
        setImmediate(cb);
    } else setTimeout(cb, 0);
}
