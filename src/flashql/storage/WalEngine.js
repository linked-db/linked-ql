import { WalEngine as BaseWalEngine } from '../../proc/timeline/WalEngine.js';

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

        await this.#storageEngine._resolveRelationSelector(selector, (tx, nsName, tblName) => {
            const tblDef = tx.showView({ namespace: nsName, name: tblName }, { ifExists: true });

            if (this.#storageEngine._viewIsPureFederation(tblDef)) {
                if (!viewSubsMap[nsName]) viewSubsMap[nsName] = {};
                viewSubsMap[nsName][tblName] = tblDef;
            } else {
                if (!localTableSubs[nsName]) localTableSubs[nsName] = [];
                localTableSubs[nsName].push(tblName);
            }
        }, { tx });

        const gcArray = [];

        for (const [nsName, subs] of Object.entries(viewSubsMap)) {
            for (const [tblName, tblDef] in Object.entries(subs)) {
                const viewClient = await this.#storageEngine.getSourceClient(tblDef);
                const pureRefDecode = this.#storageEngine._viewSourceExprIsPureRef(tblDef);
                
                if (pureRefDecode) {
                    gcArray.push(viewClient.wal.subscribe({ [pureRefDecode.namespace]: pureRefDecode.name }, async (commit) => {
                        if (!commit.computed) {
                            const remappedEntries = commit.entries.map((e) => ({ ...e, relation: { ...e.relation, namespace: nsName, name: tblName } }));
                            await callback({ ...commit, entries: remappedEntries });
                        } else {
                            await callback(commit);
                        }
                    }, { tx, ...options }));
                } else {
                    const rtResult = await viewClient.query(tblDef.source_expr_ast, callback, { tx, ...options, live: true });
                    gcArray.push(() => rtResult.abort());
                    // TODO: decide what happens on first result
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
