import { MIRROR_RELATION_TYPES } from '../../flashql/constants.js';

export class SyncEngine {

    #storageEngine;
    #remoteProvider;

    constructor(storageEngine, { remoteProvider = null } = {}) {
        this.#storageEngine = storageEngine;
        this.#remoteProvider = remoteProvider;
    }

    setRemoteProvider(remoteProvider) {
        this.#remoteProvider = remoteProvider;
    }

    get remoteProvider() { return this.#remoteProvider; }
    get storageEngine() { return this.#storageEngine; }

    async listMirrors(options) {
        return await this.#storageEngine.listMirrors(options);
    }

    async showMirror(tableRef) {
        return await this.#storageEngine.showMirror(tableRef);
    }

    async resetMirror(tableRef, options) {
        return await this.#storageEngine.resetMirror(tableRef, options);
    }

    async pullOnce({ relationTypes = [MIRROR_RELATION_TYPES.REPLICA_IN, MIRROR_RELATION_TYPES.REPLICA_BI] } = {}) {
        if (!this.#remoteProvider) {
            throw new Error('SyncEngine requires a remoteProvider.');
        }

        const mirrors = await this.#storageEngine.listMirrors();
        const targets = mirrors.filter((m) => relationTypes.includes(m.relationType));

        for (const mirror of targets) {
            const remote = await this.#remoteProvider(mirror.origin);
            if (!remote) throw new Error(`Missing remote client for origin ${JSON.stringify(mirror.origin)}`);

            const lastSeenCommit = Number.isInteger(mirror.lastInsyncCommit) ? mirror.lastInsyncCommit : 0;
            const result = await remote.query(mirror.querySpec, { live: true, last_seen_commit: lastSeenCommit });

            const rows = result.isNullResultSet ? null : result.rows;
            if (rows !== null) {
                await this.#storageEngine.transaction(async (tx) => {
                    const tableRef = { namespace: mirror.namespace, name: mirror.name };
                    const tableStorage = tx.getTable(tableRef);
                    await tableStorage.truncate();
                    for (const row of rows) {
                        await tableStorage.insert(row);
                    }
                    if (lastSeenCommit) {
                        await tx.alterTable(tableRef, { last_insync_commit: 0 });
                    }
                });
            }

            result.abort?.();
        }
    }

    async pushOnce({ relationTypes = [MIRROR_RELATION_TYPES.REPLICA_OUT, MIRROR_RELATION_TYPES.REPLICA_BI], maxCommits = null } = {}) {
        if (!this.#remoteProvider) {
            throw new Error('SyncEngine requires a remoteProvider.');
        }
        if (!this.#storageEngine.keyval) {
            throw new Error('Outsync requires keyval persistence to be enabled.');
        }

        const walHead = await this.#storageEngine.getWalHead();
        if (!walHead) return;

        const mirrors = await this.#storageEngine.listMirrors();
        const targets = mirrors.filter((m) => relationTypes.includes(m.relationType));

        for (const mirror of targets) {
            const remote = await this.#remoteProvider(mirror.origin);
            if (!remote) throw new Error(`Missing remote client for origin ${JSON.stringify(mirror.origin)}`);

            let lastSent = Number.isInteger(mirror.lastOutsyncCommit) ? mirror.lastOutsyncCommit : 0;
            const end = maxCommits ? Math.min(walHead, lastSent + maxCommits) : walHead;

            for (let commitTime = lastSent + 1; commitTime <= end; commitTime++) {
                const walEntry = await this.#storageEngine.getWalEntry(commitTime);
                if (!walEntry) throw new Error(`Missing WAL entry at position ${commitTime}`);

                const changes = walEntry.changes.filter((change) => {
                    return change.relation?.namespace === mirror.namespace
                        && change.relation?.name === mirror.name;
                });

                if (changes.length) {
                    const outQueryObjects = changes.map((change) => {
                        const op = change.op;
                        const outQueryObject = { ...mirror.querySpec, command: op };

                        if (op === 'insert') {
                            outQueryObject.payload = [{ ...(mirror.querySpec?.filters || {}), ...change.new }];
                        } else {
                            const keyCols = change.relation?.keyColumns || [];
                            const key = Object.fromEntries(keyCols.map((k) => [k, change.old?.[k]]));
                            outQueryObject.filters = { ...(mirror.querySpec?.filters || {}), ...key };
                            if (op === 'update') outQueryObject.payload = change.new;
                        }

                        return outQueryObject;
                    });

                    await remote.query(outQueryObjects);
                }

                lastSent = commitTime;
            }

            if (lastSent !== mirror.lastOutsyncCommit) {
                await this.#storageEngine.transaction(async (tx) => {
                    await tx.alterTable(
                        { namespace: mirror.namespace, name: mirror.name },
                        { last_outsync_commit: lastSent }
                    );
                });
            }
        }
    }
}
