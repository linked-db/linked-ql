import { normalizeQueryArgs } from '../clients/abstracts/util.js';
import { LinkedQLClient } from '../clients/abstracts/LinkedQLClient.js';
import { RealtimeClient } from '../proc/realtime/RealtimeClient.js';
import { StorageEngine } from './storage/StorageEngine.js';
import { QueryEngine } from './eval/QueryEngine.js';
import { SQLParser } from '../lang/SQLParser.js';
import { registry } from '../lang/registry.js';
import { Result } from '../clients/Result.js';

export class FlashQL extends LinkedQLClient {

    // Standard getters: parsers, resolver, wal, sync

    #parser;
    #wal;
    #live;

    get parser() { return this.#parser; }
    get resolver() {
        if (!this.#storageEngine) {
            throw new Error('FlashQL is not connected yet');
        }
        return super.resolveGetResolver(() =>
            this.#storageEngine.getResolver());
    }
    get wal() { return this.#wal; }
    get live() { return this.#live; }
    get sync() { return this.#storageEngine.sync; }

    // FlashQL-specific

    #keyval;
    #storageEngine;
    #queryEngine;
    #versionStop;
    #overwriteForward;

    get keyval() { return this.#keyval; }
    get storageEngine() { return this.#storageEngine; }
    get queryEngine() { return this.#queryEngine; }

    // Internal

    #realtimeClient;

    // ------------

    constructor({
        dialect = 'postgres',
        keyval = null,
        storageEngine = null,
        queryEngine = null,
        versionStop = null,
        overwriteForward = false,
        ...options
    } = {}) {
        super({ dialect, ...options });
        if (storageEngine && versionStop) {
            throw new TypeError('Cannot specify both storageEngine and versionStop');
        }
        if (queryEngine && !storageEngine) {
            throw new TypeError('queryEngine requires a storageEngine instance');
        }

        this.#keyval = keyval;
        this.#versionStop = versionStop;
        this.#overwriteForward = overwriteForward;
        this.#storageEngine = storageEngine || new StorageEngine({ flashQlClient: this, dialect: this.dialect, keyval, ...options });
        this.#queryEngine = queryEngine || new QueryEngine(this.#storageEngine, { dialect: this.dialect, ...options });

        this.#parser = new SQLParser({ dialect: this.dialect });
        this.#realtimeClient = new RealtimeClient(this);

        this.#wal = this.#storageEngine?.wal || null;
        this.#live = {
            forget: async (id) => await this.#realtimeClient.forget(id),
        };
    }

    async connect() {
        await super.connect();
        await this.#storageEngine.open({ versionStop: this.#versionStop, overwriteForward: this.#overwriteForward });
    }

    async disconnect() {
        if (this.#storageEngine) {
            await this.#storageEngine.close();
        }
        await super.disconnect();
    }

    // ------------

    async begin(options = {}) {
        return this.#storageEngine.begin(options);
    }

    async transaction(cb, options = {}) {
        return await this.#storageEngine.transaction(cb, options);
    }

    async query(...args) {
        const [_query, { tx: inputTx, ...options }] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);

        if (options.live) {
            const schemaInference = this.resolver;
            const resolvedQuery = await schemaInference.resolveQuery(query, { ...options, tx: inputTx });
            return await this.#realtimeClient.query(resolvedQuery, { ...options, tx: inputTx });
        }

        const tx = this.#storageEngine.begin({ parentTx: inputTx });
        let canDirectlyForwardTo = undefined;

        try {
            query.walkTree((v) => {
                if (canDirectlyForwardTo === false) return;
                let nsName, tblName;

                if (v instanceof registry.TableRef1
                    && (nsName = v.qualifier()?.value())
                    && (tblName = v.value())) {

                    const tblDef = tx.showView({ namespace: nsName, name: tblName }, { ifExists: true });
                    const replicationAttrs = tblDef?.view_mode_replication_attrs;
                    const effectiveReplicationOrigin = replicationAttrs?.effective_replication_origin;
                    let upstreamRelation;

                    if (tblDef
                        // Is pure federation?
                        && tblDef.view_opts_replication_mode === 'none'
                        && replicationAttrs.mapping_level === 'table'
                        // Source expr is pure ref
                        && (upstreamRelation = replicationAttrs.upstream_relation)
                        && (upstreamRelation.namespace === nsName && upstreamRelation.name === tblName)
                        // Is same origin
                        && (canDirectlyForwardTo === undefined || canDirectlyForwardTo === effectiveReplicationOrigin)) {
                        canDirectlyForwardTo = canDirectlyForwardTo || effectiveReplicationOrigin;
                    } else {
                        canDirectlyForwardTo = false;
                    }
                } else return v;
            }, true);

            if (canDirectlyForwardTo) {
                const upstreamClient = await this.#storageEngine.getUpstreamClient(canDirectlyForwardTo);

                try {
                    const result = await upstreamClient.query(query, options);
                    await tx.commit();
                    return result;
                } catch (e) {
                    await tx.rollback();
                    throw e;
                }
            }

            const result = await this.#queryEngine.query(query, { ...options, tx });
            await tx.commit();

            if (options.bufferResultRows === false) return result;
            return new Result({ rows: result.rows, rowCount: result.rowCount });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    }

    async stream(...args) {
        const [_query, { tx: inputTx, ...options }] = normalizeQueryArgs(...args);
        const _this = this;
        return {
            async *[Symbol.asyncIterator]() {
                let stream;
                try {
                    (stream = await _this.query(_query, { ...options, tx: inputTx, live: false, bufferResultRows: false }));
                    for await (const row of stream) {
                        yield row;
                    }
                } finally {
                    if (typeof stream?.return === 'function') {
                        await stream.return();
                    }
                }
            }
        };
    }

}
