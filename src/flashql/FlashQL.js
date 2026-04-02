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
        this.#storageEngine = storageEngine || new StorageEngine({ client: this, dialect: this.dialect, keyval, ...options });
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

    async _beginTransaction(options = {}) {
        return this.#storageEngine.begin(options);
    }

    async _commitTransaction(tx) {
        await tx.commit();
    }

    async _rollbackTransaction(tx) {
        await tx.abort();
    }

    async transaction(cb, options = {}) {
        if (typeof cb !== 'function') {
            throw new TypeError('transaction(cb): cb must be a function');
        }

        const tx = await this._beginTransaction(options);
        try {
            const result = await cb(tx);
            await this._commitTransaction(tx);
            return result;
        } catch (e) {
            await this._rollbackTransaction(tx);
            throw e;
        }
    }

    async query(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);

        if (options.live) {
            if (options.tx) {
                throw new Error('Live queries are not supported inside explicit transactions');
            }
            const schemaInference = this.resolver;
            const resolvedQuery = await schemaInference.resolveQuery(query, options);
            return await this.#realtimeClient.query(resolvedQuery, options);
        }

        const tx = this.#storageEngine.begin({ parentTx: options.tx });
        let canDirectlyForwardTo = null;

        try {
            query.walkTree((v) => {
                if (canDirectlyForwardTo === false) return;
                let nsName, tblName;

                if (v instanceof registry.TableRef1
                    && (nsName = v.qualifier()?.value())
                    && (tblName = v.value())) {

                    const tblDef = tx.showView({ namespace: nsName, name: tblName }, { ifExists: true });
                    const replicationOrigin = this.#storageEngine._viewResolveOrigin(tblDef);
                    let pureRefDecode;


                    if (tblDef
                        // Is pure federation?
                        && this.#storageEngine._viewIsPureFederation(tblDef)
                        // Source expr is pure ref
                        && (pureRefDecode = this.#storageEngine._viewSourceExprIsPureRef(tblDef))
                        && (pureRefDecode.namespace === nsName && pureRefDecode.name === tblName)
                        // Is same origin
                        && (canDirectlyForwardTo === null || canDirectlyForwardTo === replicationOrigin)) {
                        canDirectlyForwardTo = canDirectlyForwardTo || replicationOrigin;
                    } else {
                        canDirectlyForwardTo = false;
                    }
                } else return v;
            }, true);

            if (canDirectlyForwardTo) {
                await tx.abort(); // Abandon tx
                const upstreamClient = await this.#storageEngine.getUpstreamClient(canDirectlyForwardTo);
                return await upstreamClient.query(query, options);
            }

            const result = await this.#queryEngine.query(query, { ...options, tx });
            await tx.commit();

            if (options.bufferResultRows === false) return result;
            return new Result({ rows: result.rows, rowCount: result.rowCount });
        } catch (e) {
            await tx.abort();
            throw e;
        }
    }

    async stream(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const _this = this;
        return {
            async *[Symbol.asyncIterator]() {
                let stream;
                try {
                    (stream = await _this.query(_query, { ...options, live: false, bufferResultRows: false }));
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
