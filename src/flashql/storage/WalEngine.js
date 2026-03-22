import { WalEngine as BaseWalEngine } from '../../proc/sync/WalEngine.js';

export class WalEngine extends BaseWalEngine {

    #storageEngine;

    constructor({ storageEngine, ...options }) {
        super(options);
        this.#storageEngine = storageEngine;
    }

    async subscribe(selector, callback, { tx = null, ...options } = {}) {
        if (typeof selector === 'function') {
            options = callback || {};
            callback = selector;
            selector = '*';
        }

        const localTableSubs = {};
        const viewSubsMap = {};
        const nsDefs = new Map;

        await this.#storageEngine._resolveRelationSelector(selector, (tx, nsName, tblName) => {
            const tblDef = tx.showView({ namespace: nsName, name: tblName }, { ifExists: true });
            nsDefs.set(nsName, tblDef?.namespace_id);

            if (tblDef?.persistence === 'origin') {
                if (!viewSubsMap[nsName]) viewSubsMap[nsName] = {};
                viewSubsMap[nsName][tblName] = tblDef.view_spec;
            } else {
                if (!localTableSubs[nsName]) localTableSubs[nsName] = [];
                localTableSubs[nsName].push(tblName);
            }
        }, { tx });

        const gcArray = [];

        for (const [nsName, subs] of Object.entries(viewSubsMap)) {
            const viewClient = await this.#storageEngine.getSourceClient(nsDefs.get(nsName));
            if (!viewClient)
                throw new Error(`Could not derive the query client for given view subscription`);

            for (const [tblName, viewSpec] in Object.entries(subs)) {
                if (viewSpec.query || viewSpec.filters) {
                    const rtResult = await viewClient.query(viewSpec, callback, { tx, ...options, live: true });
                    gcArray.push(() => rtResult.abort());
                    // TODO: decide what happens on first result
                } else {
                    gcArray.push(viewClient.wal.subscribe({ [viewSpec.namespace]: viewSpec.name }, async (commit) => {
                        if (!commit.computed) {
                            const remappedEntries = commit.entries.map((e) => ({ ...e, relation: { ...e.relation, namespace: nsName, name: tblName } }));
                            await callback({ ...commit, entries: remappedEntries });
                        } else {
                            await callback(commit);
                        }
                    }, { tx, ...options }));
                }
            }
        }

        if (Object.keys(localTableSubs).length) {
            gcArray.push(super.subscribe(localTableSubs, callback, options));
        }

        const _gcArray = await Promise.all(gcArray);
        return async () => await Promise.all(_gcArray.map((c) => c()));
    }

}
