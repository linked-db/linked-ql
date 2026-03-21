import '../../lang/index.js';
import { SchemaInference } from './SchemaInference.js';
import { matchRelationSelector, normalizeRelationSelectorArg } from '../../clients/abstracts/util.js';
import { DEFAULT_USERSPACE_DATA } from './bootstrap/catalog.bootstrap.js';
import { MVCCEngine } from './MVCCEngine.js';
import { SyncEngine } from './SyncEngine.js';

export class StorageEngine extends MVCCEngine {

    #client;
    #dialect;
    #keyval;
    #options;
    #sync;

    #onCreateForeignClient;
    #foreignClients = new Map;

    #catalog = new Map;

    #isHydrating;
    #initCalled;

    get client() { return this.#client; }
    get dialect() { return this.#dialect; }
    get keyval() { return this.#keyval; }
    get options() { return { ...this.#options }; }
    get sync() { return this.#sync; }

    get _catalog() { return this.#catalog; }

    constructor({ client = null, dialect = 'postgres', keyval = null, onCreateForeignClient = null, ...options } = {}) {
        super();

        this.#client = client;
        this.#dialect = dialect;
        this.#keyval = keyval;
        this.#keyval = keyval;
        this.#options = options;

        this.#sync = new SyncEngine({ storageEngine: this, keyval: keyval ?? undefined, drainMode: 'never' });
    }

    async init() {
        if (this.#initCalled) return;
        this.#initCalled = true;

        if (await this.#sync.latestCommit()) {
            await this.#hydrateFromPersistence();
        } else {
            await this.#hydrateFromDefaults();
        }
    }

    async close() {
        await this.#sync.close({ destroy: true });
    }

    getResolver() {
        return new SchemaInference({ storageEngine: this });
    }

    async getForeignClient(origin) {
        if (!this.#onCreateForeignClient)
            throw new Error('Cannot process foreign operation; missing options.onCreateForeignClient');
        if (!this.#foreignClients.has(origin)) {
            this.#foreignClients.set(origin, await this.#onCreateForeignClient(origin));
        }
        return this.#foreignClients.get(origin);
    }

    // ----- bootloader/WAL

    async #hydrateFromDefaults() {
        await this.transaction(async (tx) =>
            await tx.replay(DEFAULT_USERSPACE_DATA));
    }

    async #hydrateFromPersistence() {
        this.#isHydrating = true;

        try {
            for await (const commit of this.#sync.streamCommits()) {
                await this.transaction(async (tx) => {
                    await tx.replay(commit.entries);
                });

                const sequenceHeads = commit.sequenceHeads || {};
                for (const [seqId, seqValue] of Object.entries(sequenceHeads)) {
                    this.#sequences.set(seqId, seqValue);
                }
            }
        } finally {
            this.#isHydrating = false;
        }
    }

    async #persistCommit(tx) {
        const commitTime = this.txMeta(tx.id)?.commitTime;

        const sequenceHeads = Object.fromEntries([
            ...tx._affectedSequences
        ].map((seqId) => [seqId, this.#sequences.get(seqId)]));

        const commit = {
            txId: tx.id,
            commitTime,
            sequenceHeads,
            entries: structuredClone(tx._changeLog),
            timestamp: Date.now(),
        };

        await this.#sync.dispatch(commit);
    }

    // ----- sessionConfig

    #sessionConfig = new Map;

    setSessionConfig(name, value, tx = null) {
        if ([].concat(value).some((x) => typeof x !== 'string' && !(x instanceof String))) {
            throw new Error(`[${name}] Config value must be a string or an array of strings`);
        }

        const prev = this.#sessionConfig.get(name);
        const _new = typeof value === 'string'
            ? new String(value)
            : value;

        this.#sessionConfig.set(name, _new);

        tx?.addUndo(() => {
            if (this.#sessionConfig.get(name) !== _new) return;
            this.#sessionConfig.set(name, prev);
        });
    }

    getSessionConfig(name, tx = null) {
        const value = this.#sessionConfig.get(name);
        return value instanceof String
            ? value + ''
            : value;
    }

    // ----- sequences

    #sequences = new Map;

    _nextSequence(seqId) {
        if (!this.#sequences.has(seqId)) {
            this.#sequences.set(seqId, 1);
        }

        const v = this.#sequences.get(seqId);
        this.#sequences.set(seqId, v + 1);

        return v;
    }

    _ensureSequenceAtLeast(seqId, nextValue) {
        if (!Number.isInteger(nextValue)) return;
        const current = this.#sequences.get(seqId) || 1;
        if (nextValue > current) {
            this.#sequences.set(seqId, nextValue);
        }
    }

    // ----- Schemas



    async _resolveRelationSelector(selector, handle, { handlerMode = 'sync', tx: inputTx = null } = {}) {
        const tx = inputTx || this.begin();
        const isPattern = (s) => /^%|%$|^!/.test(s);

        try {
            const selectorMap = normalizeRelationSelectorArg(selector);
            for (const [nsNameMaybeWildcard, tblNames] of Object.entries(selectorMap)) {

                const _nsNames = [nsNameMaybeWildcard];
                const nsNames = nsNameMaybeWildcard === '*'
                    ? tx.listNamespaces()
                    : (isPattern(nsNameMaybeWildcard)
                        ? tx.listNamespaces().sort().filter((s) => matchRelationSelector(s, _nsNames))
                        : _nsNames);

                for (const nsName of nsNames) {
                    for (const tblNameMaybeWildcard of tblNames) {

                        const _tblNames = [tblNameMaybeWildcard];
                        const tblNames = tblNameMaybeWildcard === '*'
                            ? tx.listTables({ namespace: nsName }).sort()
                            : (isPattern(tblNameMaybeWildcard)
                                ? tx.listTables({ namespace: nsName }).sort().filter((s) => matchRelationSelector(s, _tblNames))
                                : _tblNames);

                        for (const tblName of tblNames) {
                            const handlerReturn = handle(tx, nsName, tblName);
                            if (handlerMode === 'async') await handlerReturn;
                        }
                    }
                }
            }

            if (!inputTx) await tx.commit();
        } catch (e) {
            if (!inputTx) await tx.abort();
            throw e;
        }
    }

    // ----- transactions

    async transaction(cb, options = {}) {
        const tx = this.begin(options);
        let returnValue;

        try {
            returnValue = await cb(tx);
            await tx.commit();
        } catch (e) {
            await tx.abort();
            throw e;
        }

        return returnValue;
    }

    async commit(tx) {
        const returnValue = await super.commit(tx);

        if (!this.#isHydrating) {
            await this.#persistCommit(tx);
        }

        return returnValue;
    }
}
