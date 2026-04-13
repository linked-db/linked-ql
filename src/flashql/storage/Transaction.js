import { CatalogAPI } from './schemas/CatalogAPI.js';

export class Transaction extends CatalogAPI {

    #storageEngine;
    #parentTx;
    #id;
    #snapshot;
    #meta;
    #strategy;

    #changeLog = [];
    #upstreamLog = new Map;
    #upstreamQueue = new Map;

    #undoLog = [];
    #finallizeLog = [];

    #readVersions = new Set;
    #writeVersions = new Set;
    #readKeys = new Set;
    #writeKeys = new Set;
    #predicateReads = [];

    #affectedSequences = new Set;
    #versioningCache = new Map;

    #targetState;
    #targetStateCaller;

    get storageEngine() { return this.#storageEngine; }
    get parentTx() { return this.#parentTx; }
    get rootTx() { return this.#parentTx?.rootTx || this; }
    get id() { return this.#id; }
    get snapshot() { return this.#snapshot; }
    get meta() { return this.#meta; }

    get _strategy() { return this.#strategy; }

    get _changeLog() { return this.#changeLog; }
    get _upstreamLog() { return this.#upstreamLog; }
    get _upstreamQueue() { return this.#upstreamQueue; }

    get _undoLog() { return this.#undoLog; }
    get _finallizeLog() { return this.#finallizeLog; }

    get _readVersions() { return this.#readVersions; }
    get _writeVersions() { return this.#writeVersions; }
    get _readKeys() { return this.#readKeys; }
    get _writeKeys() { return this.#writeKeys; }
    get _predicateReads() { return this.#predicateReads; }

    get _affectedSequences() { return this.#affectedSequences; }
    get _versioningCache() { return this.#versioningCache; }

    get _targetState() { return this.#targetState; }

    constructor({ storageEngine, id, snapshot, strategy, meta = null, parentTx = null }) {
        super({ storageEngine });

        this.#storageEngine = storageEngine;
        this.#id = id;
        this.#parentTx = parentTx;
        this.#snapshot = snapshot;
        this.#strategy = strategy;
        this.#meta = meta && typeof meta === 'object' ? { ...meta } : meta;

        if (parentTx) {
            parentTx.addFinallizer(async () => {
                // Parent was committed
                if (this.#targetState === 'abort') return;
                // Implicitly commit
                await this.#storageEngine.commit(this);
            });
            parentTx.addUndo(async () => {
                // Parent was aborted
                if (this.#targetState === 'abort') return;
                // Implicitly abort
                await this.#storageEngine.rollback(this);
            });
        }
    }

    // -------

    setXMIN(version, xmin) {
        return this.#strategy.setXMIN(version, xmin);
    }

    matchXMIN(version, xmin) {
        return this.#strategy.matchXMIN(version, xmin);
    }

    setXMAX(version, xmax) {
        return this.#strategy.setXMAX(version, xmax);
    }

    resetXMAX(version, xmax) {
        return this.#strategy.resetXMAX(version, xmax);
    }

    matchXMAX(version, xmax) {
        return this.#strategy.matchXMAX(version, xmax);
    }

    // -------

    trackRead(version, pk) {
        this.#strategy.onRead(this, version, pk);
    }

    trackWrite(version, pk) {
        this.#strategy.onWrite(this, version, pk);
    }

    trackInsertWrite(version, pk) {
        this.#strategy.onInsert(this, version, pk);
    }

    trackPredicateRead(entry) {
        this.#strategy.onPredicateRead(this, entry);
    }

    recordPredicateRead(entry) {
        this.#predicateReads.push(entry);
    }

    // -------

    recordChange(change) {
        if (this.#storageEngine.readOnly && !this.#storageEngine._isHydrating) {
            throw new Error('StorageEngine is read-only');
        }
        this.#changeLog.push(change);

        super.recordChange(change);
    }

    recordUpstreamChange(changePayload, { queued = true }) {
        if (this.#storageEngine.readOnly && !this.#storageEngine._isHydrating) {
            throw new Error('StorageEngine is read-only');
        }
        const targetLog = queued
            ? this.#upstreamQueue
            : this.#upstreamLog;
        
        const origin = changePayload.origin || '';
        if (!targetLog.has(origin))
            targetLog.set(origin, []);
        targetLog.get(origin).push(changePayload);
    }

    addUndo(fn) {
        this.#undoLog.push(fn);
    }

    addFinallizer(fn) {
        this.#finallizeLog.push(fn);
    }

    // -------

    validate() {
        this.#strategy.validate(this);
    }

    async commit() {
        if (this.#targetState) {
            if (this.#targetState !== 'commit')
                throw new Error(`Invalid transaction state; already aborted \n${this.#targetStateCaller}`);
            return;
        }

        let parentMeta;

        // Wait for parent if still active
        if (this.#parentTx && (parentMeta = this.#storageEngine.txMeta(this.#parentTx.id))?.state === 'active') {
            this.#targetState = 'commit';
            this.#targetStateCaller = captureStackTrace();
            return;
        }

        // Throw on parent haven been aborted
        if (parentMeta?.state === 'aborted')
            throw new Error('Cannot commit as parent transaction is aborted');

        await this.#storageEngine.commit(this);

        this.#targetState = 'commit';
        this.#targetStateCaller = captureStackTrace();
    }

    async rollback() {
        if (this.#targetState) {
            if (this.#targetState !== 'abort')
                throw new Error(`Invalid transaction state; already committed \n${this.#targetStateCaller}`);
            return;
        }

        await this.#storageEngine.rollback(this);

        this.#targetState = 'abort';
        this.#targetStateCaller = captureStackTrace();
    }

    // -------

    nextSequence(seqId) {
        this.#affectedSequences.add(seqId);
        return this.#storageEngine._nextSequence(seqId);
    }
}

function captureStackTrace() {
    try { throw new Error(''); } catch (e) {
        return e.stack.split('\n').slice(3).join('\n');
    }
}
