import { LinkedQlWal } from '../../proc/timeline/LinkedQlWal.js';
import { ConflictError } from '../errors/ConflictError.js';

export class FlashQlWal extends LinkedQlWal {

    #storageEngine;

    constructor({ storageEngine, ...options }) {
        super({
            ...options,
            linkedQlClient: storageEngine.flashQlClient,
        });
        this.#storageEngine = storageEngine;
    }

    async subscribe(selector, cb, _options = {}) {
        if (typeof selector === 'function') {
            [_options, cb, selector] = [cb || {}, selector, '*'];
        }
        const { tx = null, liveQueryOriginated, isSingleTableLiveQuery, ...options } = _options;

        const localTableSubs = {};
        const viewSubsMap = {};

        await this.#storageEngine._resolveRelationSelector(selector, (tx, nsName, tblName) => {
            const tblDef = tx.showView({ namespace: nsName, name: tblName }, { ifExists: true });

            if (tblDef?.view_opts_replication_mode === 'none') {
                const viewDef = { ...tblDef, keyColumns: tx.showKeyColumns({ relation_id: tblDef.id }) };
                if (!viewSubsMap[nsName]) viewSubsMap[nsName] = {};
                viewSubsMap[nsName][tblName] = viewDef;
            } else {
                if (!localTableSubs[nsName]) localTableSubs[nsName] = [];
                localTableSubs[nsName].push(tblName);
            }
        }, { tx });

        const gcArray = [];

        for (const [nsName, subs] of Object.entries(viewSubsMap)) {
            for (const [tblName, tblDef] of Object.entries(subs)) {
                const replicationAttrs = tblDef.view_mode_replication_attrs;

                const upstreamRelation = replicationAttrs.mapping_level === 'table'
                    ? replicationAttrs.upstream_relation
                    : null;
                const upstreamClient = await this.#storageEngine.getEffectiveClient(tblDef);
                const upstream_tx = upstreamClient.storageEngine === this.#storageEngine ? tx : null;
                const upstream_liveQueryOriginated = upstreamClient.storageEngine === this.#storageEngine ? liveQueryOriginated : null;
                const upstream_isSingleTableLiveQuery = upstream_liveQueryOriginated && isSingleTableLiveQuery;

                if (upstreamRelation) {
                    gcArray.push(upstreamClient.wal.subscribe({ [upstreamRelation.namespace]: upstreamRelation.name }, async (commit) => {
                        if (!commit.computed) {
                            const remappedEntries = commit.entries.map((e) => ({ ...e, relation: { ...e.relation, namespace: nsName, name: tblName, keyColumns: tblDef.keyColumns } }));
                            await cb({ ...commit, entries: remappedEntries });
                        } else {
                            await cb(commit);
                        }
                    }, { tx: upstream_tx, liveQueryOriginated: upstream_liveQueryOriginated, isSingleTableLiveQuery: upstream_isSingleTableLiveQuery, ...options }));
                } else {
                    const rtResult = await upstreamClient.query(tblDef.source_expr_ast, async (commit) => {
                        if (rtResult.strategy.diffing && commit.type === 'diff') {
                            const remappedEntries = commit.entries.map((e) => ({
                                op: e.op,
                                old: e.old || null,
                                new: e.new || null,
                                relation: { namespace: nsName, name: tblName, keyColumns: tblDef.keyColumns },
                            }));
                            const { type, computed, ...commitMeta } = commit;
                            await cb({ ...commitMeta, entries: remappedEntries });
                        } else {
                            await cb(commit);
                        }
                    }, { ...options, tx: upstream_tx, live: true, initial: false });
                    gcArray.push(() => rtResult.abort());
                }
            }
        }

        if (Object.keys(localTableSubs).length) {
            gcArray.push(super.subscribe(localTableSubs, cb, { ...options, tx, liveQueryOriginated, isSingleTableLiveQuery }));
        }

        const _gcArray = await Promise.all(gcArray);
        return async () => await Promise.all(_gcArray.map((c) => c()));
    }

    async applyDownstreamCommit(commit, { tx: inputTx = null } = {}) {

        const applyInTx = async (tx) => {
            for (const event of commit.entries) {
                const { op, relation } = event;

                const tableStorage = tx.getRelation({ namespace: relation.namespace, name: relation.name });
                const relationPrettyName = `${JSON.stringify(relation.namespace)}.${JSON.stringify(relation.name)}`;

                if (op === 'insert') {
                    await tableStorage.insert(event.new);
                } else {
                    const oldRef = event.old;

                    const throwConflict = (foundRow = null) => {
                        throw new ConflictError(`[${relationPrettyName}] Origin row version no longer matches the expected version`, foundRow);
                    };

                    if (relation.mvccKey) {
                        if (!event.mvccTag)
                            throw new SyntaxError(`[${relationPrettyName}] Downstream commit specifies a MVCC Key but member event omits the MVCC Tag`);
                        const currentRow = tableStorage.get(oldRef, { hiddenCols: true });
                        if (!currentRow) throwConflict();
                        // Casting both sides to text is important
                        if (currentRow[relation.mvccKey] + '' !== event.mvccTag + '') throwConflict(currentRow);
                    }

                    let result;
                    if (op === 'update') {
                        result = await tableStorage.update(oldRef, event.new);
                    } else if (op === 'delete') {
                        result = await tableStorage.delete(oldRef);
                    } else {
                        throw new Error(`Unknown op type: ${op}`);
                    }
                    if (!result) throwConflict();
                }
            }
        };

        if (inputTx) return await applyInTx(inputTx);

        return await this.#storageEngine.transaction(async (tx) => {
            return await applyInTx(tx);
        });
    }
}
