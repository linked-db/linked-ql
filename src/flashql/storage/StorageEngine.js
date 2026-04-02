import '../../lang/index.js';
import { registry } from '../../lang/registry.js';
import { SchemaInference } from './SchemaInference.js';
import { matchRelationSelector, normalizeRelationSelectorArg } from '../../clients/abstracts/util.js';
import { DEFAULT_USERSPACE_DATA } from './bootstrap/catalog.bootstrap.js';
import { MVCCEngine } from './MVCCEngine.js';
import { WalEngine } from './WalEngine.js';
import { SyncManager } from '../sync/SyncManager.js';

export class StorageEngine extends MVCCEngine {

    #client;
    #dialect;
    #keyval;
    #options;
    #wal;
    #sync;

    #autoSync;
    #forcedReadOnly;
    #readOnly;
    #overwriteForward;
    #forwardHistoryTruncated;
    #openedCommitTime = null;

    #getUpstreamClient;
    #foreignClients = new Map;

    #catalog = new Map;

    #isHydrating;
    #initCalled;

    get client() { return this.#client; }
    get dialect() { return this.#dialect; }
    get keyval() { return this.#keyval; }
    get options() { return { ...this.#options }; }
    get wal() { return this.#wal; }
    get sync() { return this.#sync; }

    get readOnly() { return this.#readOnly; }
    get openedCommitTime() { return this.#openedCommitTime; }

    get _isHydrating() { return this.#isHydrating; }
    get _catalog() { return this.#catalog; }

    constructor({ client = null, dialect = 'postgres', keyval = null, autoSync = true, getUpstreamClient = null, readOnly = false, ...options } = {}) {
        super();

        this.#client = client;
        this.#dialect = dialect;
        this.#keyval = keyval;
        this.#options = options;

        this.#autoSync = !!autoSync;
        this.#getUpstreamClient = getUpstreamClient;

        this.#forcedReadOnly = !!readOnly;
        this.#readOnly = this.#forcedReadOnly;
        this.#overwriteForward = false;
        this.#forwardHistoryTruncated = true;

        this.#wal = new WalEngine({ storageEngine: this, keyval: keyval ?? undefined, drainMode: 'never' });
        this.#sync = new SyncManager(this);
    }

    async open({ versionStop = null, overwriteForward = false } = {}) {
        if (this.#initCalled) return;
        this.#initCalled = true;

        if (overwriteForward && !versionStop) {
            throw new TypeError('open({ overwriteForward }) requires versionStop');
        }
        if (this.#forcedReadOnly && overwriteForward) {
            throw new TypeError('Cannot use overwriteForward when engine is configured readOnly');
        }
        if (versionStop) {
            this.#overwriteForward = !!overwriteForward;
            this.#readOnly = this.#forcedReadOnly || !overwriteForward;
            this.#forwardHistoryTruncated = !overwriteForward;
        } else {
            this.#overwriteForward = false;
            this.#readOnly = this.#forcedReadOnly;
            this.#forwardHistoryTruncated = true;
        }

        if (typeof versionStop === 'string') {
            const tblRefNode = await registry.TableRef1.parse(versionStop);
            if (!tblRefNode)
                throw new TypeError(`Invalid version stop argument ${versionStop}`);
            versionStop = {
                namespace: tblRefNode.qualifier()?.value(),
                name: tblRefNode.value(),
                versionSpec: tblRefNode.versionSpec()?.value(),
            };
            if (!versionStop.namespace)
                throw new TypeError(`Version stop table spec must include namespace qualification: ${versionStop}`);
        } else if (versionStop) {
            if (typeof versionStop !== 'object')
                throw new TypeError('Version stop argument must be either a string or an object');
            for (const k in versionStop) {
                if (k !== 'namespace' && k !== 'name' && k !== 'versionSpec')
                    throw new TypeError(`Unexpected property ${k} in version stop argument`);
            }
            if (!versionStop.namespace || !versionStop.name)
                throw new TypeError('Version stop object must include both "namespace" and "name"');
        }

        const throwNoMatch = () => {
            throw new Error(`No table version matched ${JSON.stringify(versionStop.namespace)}.${JSON.stringify(versionStop.name)}${versionStop.versionSpec ? '@' + versionStop.versionSpec : ''} to boot to`);
        }

        if (await this.#wal.latestCommit()) {
            if (versionStop) {
                const { lastMatchedCommitTime } = await this.#hydrateFromPersistence({ versionStop, findLastMatch: true });
                if (!lastMatchedCommitTime) throwNoMatch();

                this.#catalog = new Map;
                this.#sequences.clear();

                const { lastReplayedCommitTime } = await this.#hydrateFromPersistence({ stopAtCommitTime: lastMatchedCommitTime });
                this.#openedCommitTime = lastReplayedCommitTime;
            } else {
                const { lastReplayedCommitTime } = await this.#hydrateFromPersistence({});
                this.#openedCommitTime = lastReplayedCommitTime;
            }
        } else {
            await this.#hydrateFromDefaults();
            if (versionStop) {
                const hasMatch = await this.transaction(async (tx) => {
                    return !!tx.showTable(versionStop, { ifExists: true });
                });
                if (!hasMatch) throwNoMatch();
            }
            this.#openedCommitTime = await this.#wal.latestCommit();
        }

        if (this.#autoSync && this.#keyval) {
            await this.#sync.sync();
        }
    }

    async close({ destroy = false } = {}) {
        await this.#sync.shutdown();
        await this.#wal.close({ destroy });
    }

    getResolver() {
        return new SchemaInference({ storageEngine: this });
    }

    // ----------

    _viewIsPureFederation(tblDef) {
        return tblDef?.view_opts_replication_mode === 'none';
    }

    _viewSourceExprIsPureRef(tblDef) {
        const extractFromTableRef = (tblRef) => ({
            namespace: tblRef.qualifier?.value,
            name: tblRef.value,
        });

        if (tblDef?.source_expr_ast?.nodeName === registry.TableStmt.NODE_NAME)
            return extractFromTableRef(tblDef.source_expr_ast.table_ref);

        if (tblDef?.source_expr_ast?.nodeName !== registry.CompleteSelectStmt.NODE_NAME)
            return null;

        let fromItems;
        if ((fromItems = tblDef.source_expr_ast.from_clause.entries).length > 1
            || fromItems[0].expr.nodeName !== registry.TableRef1.NODE_NAME)
            return null;

        let selectList;
        if ((selectList = tblDef.source_expr_ast.select_list.entries).length > 1
            || selectList[0].expr.nodeName !== registry.ColumnRef0.NODE_NAME)
            return null;

        if (Object.entries(tblDef.source_expr_ast).filter(([k, v]) =>
            k !== 'nodeName' && k !== 'from_clause' && k !== 'select_list' && [].concat(v || []).length).length)
            return null;

        return extractFromTableRef(fromItems[0].expr);
    }

    _viewSourceExprUpdateTransform(tblDef) {
        const transforms = {};

        if (tblDef.source_expr_ast?.nodeName === registry.TableStmt.NODE_NAME)
            return transforms;

        if (tblDef.source_expr_ast?.nodeName !== registry.CompleteSelectStmt.NODE_NAME)
            return null;

        let fromItems;
        if ((fromItems = tblDef.source_expr_ast.from_clause.entries).length > 1
            || fromItems[0].expr.nodeName !== registry.TableRef1.NODE_NAME)
            return null;

        if (Object.entries(tblDef.source_expr_ast).filter(([k, v]) =>
            k !== 'nodeName' && k !== 'from_clause' && k !== 'select_list' && k !== 'where_clause' && k !== 'order_by_clause'
            && [].concat(v || []).length).length)
            return null;

        for (const si of tblDef.source_expr_ast.select_list.entries) {
            if (si.expr.nodeName === registry.ColumnRef0.NODE_NAME) continue;
            if (si.expr.nodeName !== registry.ColumnRef1.NODE_NAME) return null;
            if (si.alias && si.alias.value !== si.expr.value) {
                transforms[si.expr.value] = si.alias.value;
            }
        }

        return transforms;
    }

    _viewResolveOrigin(tblDef) {
        if (!tblDef?.view_opts_replication_origin) return null;
        if (tblDef.view_opts_replication_origin === 'inherit') {
            if ((tblDef.namespace_id && typeof tblDef.namespace_id === 'object'))
                throw new Error('Table def shape must have namespace def shape');
            if (!tblDef.namespace_id.view_opts_default_replication_origin)
                throw new Error('Table def has view_opts_replication_origin === inherit but namespace def has no view_opts_default_replication_origin');
            return tblDef.namespace_id.view_opts_default_replication_origin;
        }
        return tblDef.view_opts_replication_origin;
    }

    async getUpstreamClient(origin) {
        if (!this.#getUpstreamClient)
            throw new Error('Cannot process foreign operation; missing options.getUpstreamClient');
        if (!this.#foreignClients.has(origin)) {
            this.#foreignClients.set(origin, await this.#getUpstreamClient(origin));
        }
        return this.#foreignClients.get(origin);
    }

    async getSourceClient(tblDef, assert = true) {
        const replicationOrigin = this._viewResolveOrigin(tblDef);
        if (replicationOrigin)
            return await this.getUpstreamClient(replicationOrigin);
        if (this.#client) return this.#client;
        if (assert) throw new Error('Operation requires a source client; configure StorageEngine with options.client or namespace replication origins');
    }

    async getSourceResolver(tblDef) {
        const client = await this.getSourceClient(tblDef, false);
        return client ? client.resolver : this.getResolver();
    }

    // ----- bootloader/WAL

    async #hydrateFromDefaults() {
        await this.transaction(async (tx) =>
            await tx.replay(DEFAULT_USERSPACE_DATA));
    }

    async #hydrateFromPersistence({ versionStop = null, findLastMatch = false, stopAtCommitTime = null } = {}) {
        this.#isHydrating = true;
        let lastMatchedCommitTime = null;
        let lastReplayedCommitTime = null;

        try {
            for await (const commit of this.#wal.streamCommits()) {
                if (Number.isInteger(stopAtCommitTime) && commit.commitTime > stopAtCommitTime) {
                    break;
                }

                await this.transaction(async (tx) => {
                    await tx.replay(commit.entries);

                    if (findLastMatch && versionStop) {
                        const tblDef = tx.showTable(versionStop, { ifExists: true });
                        if (tblDef) {
                            lastMatchedCommitTime = commit.commitTime;
                        }
                    }
                });

                const sequenceHeads = commit.sequenceHeads || {};
                for (const [seqId, seqValue] of Object.entries(sequenceHeads)) {
                    this.#sequences.set(seqId, seqValue);
                }
                lastReplayedCommitTime = commit.commitTime;
            }
        } finally {
            this.#isHydrating = false;
        }

        return { lastMatchedCommitTime, lastReplayedCommitTime };
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

        await this.#wal.dispatch(commit);
    }

    // ----- sessionConfig

    #sessionConfig = new Map;

    setSessionConfig(name, value, tx = null) {
        if ([].concat(value).some((x) => typeof x !== 'string' && !(x instanceof String))) {
            throw new Error(`[${name}] Config value must be a string or an array of strings`);
        }

        const prev = this.#sessionConfig.get(name);
        // We only store String instances internally for instance checks later
        const _new = typeof value === 'string'
            ? new String(value)
            : (typeof value === 'number'
                ? new Number(value)
                : value);

        this.#sessionConfig.set(name, _new);

        tx?.addUndo(() => {
            // Instance checks
            if (this.#sessionConfig.get(name) !== _new) return;
            this.#sessionConfig.set(name, prev);
        });
    }

    getSessionConfig(name, tx = null) {
        const value = this.#sessionConfig.get(name);
        return value instanceof String
            ? value + ''
            : (value instanceof Number
                ? value + 0
                : value);
    }

    defaultNamespace(tx = null) {
        const searchPath = this.getSessionConfig('search_path', tx) || [];
        if (searchPath.length) return searchPath[0];
        return 'public';
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
        const tx = this.begin({ parentTx: inputTx });
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

            await tx.commit();
        } catch (e) {
            await tx.abort();
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
            if (this.#overwriteForward && !this.#forwardHistoryTruncated && tx._changeLog.length) {
                await this.#wal.truncateForward(this.#openedCommitTime);
                this.#forwardHistoryTruncated = true;
            }
            await this.#persistCommit(tx);
            // Keep the original versionStop anchor intact until first mutating commit
            // performs forward-history truncation.
            if (!(this.#overwriteForward && !this.#forwardHistoryTruncated && !tx._changeLog.length)) {
                this.#openedCommitTime = this.txMeta(tx.id)?.commitTime;
            }
        }

        return returnValue;
    }
}
