import { normalizeQueryArgs } from '../clients/abstracts/util.js';
import { AbstractSQLClient } from '../clients/abstracts/AbstractSQLClient.js';
import { RealtimeClient } from '../proc/realtime/RealtimeClient.js';
import { StorageEngine } from './storage/StorageEngine.js';
import { QueryEngine } from './eval/QueryEngine.js';
import { SQLParser } from '../lang/SQLParser.js';
import { registry } from '../lang/registry.js';
import { Result } from '../clients/Result.js';

export class FlashQL extends AbstractSQLClient {

    #dialect;
    #parser;
    #sync;
    #realtimeClient;

    #storageEngine;
    #queryEngine;

    get dialect() { return this.#dialect; }
    get parser() { return this.#parser; }
    get sync() { return this.#sync; }
    get realtimeClient() { return this.#realtimeClient; }

    get storageEngine() { return this.#storageEngine; }
    get queryEngine() { return this.#queryEngine; }

    #managedSyncAbortLines = new Map;

    constructor({
        dialect = 'postgres',
        capability = {},
        keyval = null,
        storageEngine = null,
        queryEngine = null,
        ...options
    } = {}) {
        super({ capability });

        this.#dialect = dialect;
        this.#parser = new SQLParser({ dialect: this.dialect });

        this.#storageEngine = storageEngine || new StorageEngine({ client: this, dialect, keyval, ...options });
        this.#queryEngine = queryEngine || new QueryEngine(this.#storageEngine, { dialect, ...options });

        this.#sync = this.#storageEngine.sync;
        this.#realtimeClient = new RealtimeClient(this);
    }

    async connect() {
        await super.connect();
        await this.#storageEngine.init();
    }

    async disconnect() {
        for (const abortLine of this.#managedSyncAbortLines.values())
            abortLine?.();
        this.#managedSyncAbortLines.clear();
        await this.#storageEngine.close();
        await super.disconnect();
    }

    createSchemaInference() {
        return this.#storageEngine.createSchemaInference();
    }

    async query(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.#parser.parse(_query, options);

        if (options.live && query.fromClause?.()) {
            const schemaInference = this.createSchemaInference();
            const resolvedQuery = await schemaInference.resolveQuery(query, options);
            return await this.#realtimeClient.query(resolvedQuery, options);
        }

        const tx = this.#storageEngine.begin();
        let canDirectlyForwardTo = null;

        try {
            query.walkTree((v) => {
                if (canDirectlyForwardTo === false) return;
                let nsName, tblName;

                if (v instanceof registry.TableRef1
                    && (nsName = v.qualifier()?.value())
                    && (tblName = v.value())) {

                    const tblDef = tx.showView({ namespace: nsName, name: tblName }, { ifExists: true });

                    if (tblDef?.namespace_id.replication_origin
                        && tblDef.persistence === 'origin'
                        && tblDef.view_spec.namespace === nsName
                        && tblDef.view_spec.name === tblName
                        && !tblDef.view_spec.filters
                        && (canDirectlyForwardTo === null || canDirectlyForwardTo.name === nsName)) {
                        canDirectlyForwardTo = canDirectlyForwardTo || tblDef.namespace_id;
                    } else {
                        canDirectlyForwardTo = false;
                    }
                } else return v;
            }, true);

            if (canDirectlyForwardTo) {
                await tx.abort(); // Abandon tx
                const client = await this.#storageEngine.getForeignClient(canDirectlyForwardTo.replication_origin);
                return await client.query(query, options);
            }

            const result = await this.#queryEngine.query(query, { ...options, tx });
            await tx.commit();

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
                    for await (const row of stream) yield row;
                } finally {
                    if (typeof stream?.return === 'function') {
                        await stream.return();
                    }
                }
            }
        };
    }

    /*
    async #federate(specifiers, options, origin, materializeCallback = null, relationType = MIRROR_RELATION_TYPES.FEDERATED) {
        const remoteClient = await this.getForeignClient(origin);

        await this.#storageEngine.transaction(async (tx) => {
            for (const [nsName, queryObjects] of specifiers.entries()) {

                for (const querySpec of queryObjects) {
                    let query = null;
                    let payload;

                    if (querySpec.schema) {
                        payload = Object.freeze({
                            namespace: nsName,
                            name: querySpec.name,
                            columns: Object.freeze([...(querySpec.schema.columns || [])].map((col) => Object.freeze({ ...col }))),
                            constraints: Object.freeze([...(querySpec.schema.constraints || [])].map((con) => Object.freeze({ ...con }))),
                            indexes: Object.freeze([...(querySpec.schema.indexes || [])].map((idx) => Object.freeze({ ...idx }))),
                        });
                    } else {
                        query = await remoteClient.resolve(querySpec);
                        const tableSchema = registry.TableSchema.fromJSON({
                            name: { nodeName: registry.Identifier.NODE_NAME, value: querySpec.name },
                            entries: query.resultSchema().entries().map((e) => e.jsonfy()),
                        }, { assert: true });
                        payload = this.#queryEngine.tableSchemaToCreatePayload(tableSchema, nsName);
                    }

                    await this.#storageEngine.upsertMirror({
                        namespace: nsName,
                        name: querySpec.name,
                        mirrorType: options.type,
                        origin,
                        querySpec,
                        relationType,
                        tablePayload: payload,
                        ifNotExists: options.ifNotExists,
                        tx,
                    });

                    if (materializeCallback) {
                        if (!query) query = await remoteClient.resolve(querySpec);
                        const tableStorage = tx.getTable({ namespace: nsName, name: querySpec.name });
                        await materializeCallback(tableStorage, query, tx, remoteClient, nsName, querySpec.name);
                    }
                }
            }
        });
    }

    async #materialize(specifiers, options, origin, { relationType = MIRROR_RELATION_TYPES.SNAPSHOT } = {}) {
        const gcArray = [];

        for (const [nsName, queryObjects] of specifiers.entries()) {
            for (const querySpec of queryObjects) {

                const singleSpec = new Map([[nsName, new Set([querySpec])]]);
                const effectiveRelationType =
                    options.live && relationType === MIRROR_RELATION_TYPES.SNAPSHOT
                        ? MIRROR_RELATION_TYPES.REPLICA_IN
                        : relationType;

                await this.#federate(singleSpec, options, origin, async (tableStorage, query, tx, remoteClient, _nsName, tblName) => {
                    let stream;

                    if (options.live) {
                        const tblDef = tx.showTable({ namespace: nsName, name: tblName }, { ifExists: true });
                        const lastSeenCommit = Number.isInteger(tblDef?.replication_last_seen_commit)
                            ? tblDef.replication_last_seen_commit
                            : 0;

                        const result = await remoteClient.query(
                            query,
                            (eventName, eventData) => this.#handleInSync({ namespace: nsName, name: tblName }, eventName, eventData),
                            { live: true, last_seen_commit: lastSeenCommit }
                        );
                        stream = result.isNullResultSet ? null : result.rows;

                        gcArray.push(result.abort?.bind(result));

                        if (stream !== null) {
                            if (lastSeenCommit) {
                                await tx.alterTable({ namespace: nsName, name: tblName }, { replication_last_seen_commit: 0 });
                            }
                            await this.#resetTableData(tableStorage);
                        }
                    } else {
                        await this.#resetTableData(tableStorage);
                        stream = await remoteClient.stream(query);
                    }

                    if (stream !== null) {
                        for await (const row of stream) {
                            try {
                                await tableStorage.insert(row);
                            } catch (e) {
                                if (e instanceof ConflictError) {
                                    if (!options.ifNotExists) {
                                        await tableStorage.update(e.existing, row);
                                    }
                                } else throw e;
                            }
                        }
                    }
                }, effectiveRelationType);
            }
        }

        return () => gcArray.forEach((c) => c && c());
    }

    async #sync(specifiers, options, origin) {
        if (!this.#storageEngine.keyval) {
            throw new Error('Sync requires keyval persistence to be enabled.');
        }
        const gcArray = [];

        for (const [nsName, queryObjects] of specifiers.entries()) {
            for (const querySpec of queryObjects) {

                const tableRef = { namespace: nsName, name: querySpec.name };

                const singleSpec = new Map([[nsName, new Set([querySpec])]]);
                const inSyncAbortLine = await this.#materialize(singleSpec, { ...options, live: true }, origin, { relationType: MIRROR_RELATION_TYPES.REPLICA_BI });
                gcArray.push(inSyncAbortLine);

                const outSyncAbortLine = await this.subscribe(
                    { [nsName]: [querySpec.name] },
                    (events) => this.#handleOutSync(events, querySpec, origin, tableRef)
                );
                gcArray.push(outSyncAbortLine);

                this.#setManagedSyncAbortLine(tableRef, () => {
                    inSyncAbortLine?.();
                    outSyncAbortLine?.();
                });
            }
        }

        return () => gcArray.forEach((c) => c && c());
    }

    async #handleInSync(tableRef, eventName, eventData) {
        if (eventName !== 'diff' || !Array.isArray(eventData)) return;

        await this.#storageEngine.transaction(async (tx) => {
            const tableStorage = tx.getTable(tableRef);

            for (const event of eventData) {
                if (event.type === 'insert' && event.new) {
                    await tableStorage.insert(event.new);
                } else if (event.type === 'update' && event.old && event.new) {
                    await tableStorage.update(event.old, event.new);
                } else if (event.type === 'delete') {
                    const key = event.old || event.key || event.new;
                    if (key) await tableStorage.delete(key);
                }
            }
        }, { meta: { source: 'sync' } });
    }

    async #handleOutSync(events, querySpec, origin, tableRef) {
        await this.#enqueueOutsyncEvents(events, querySpec, origin, tableRef);
        await this.#drainOutsyncQueue();
    }

    async #resetTableData(tableStorage) {
        const rows = tableStorage.getAll();
        for (const row of rows) {
            await tableStorage.delete(row);
        }
    }

    #setManagedSyncAbortLine(tableRef, abortLine) {
        const key = `${tableRef.namespace}.${tableRef.name}`;
        const previous = this.#managedSyncAbortLines.get(key);
        previous?.();

        if (abortLine) this.#managedSyncAbortLines.set(key, abortLine);
        else this.#managedSyncAbortLines.delete(key);
    }

    async #enqueueOutsyncEvents(events, querySpec, origin, tableRef) {
        await this.#storageEngine.transaction(async (tx) => {
            const tblDef = tx.showTable(tableRef, { ifExists: true });
            if (!tblDef) return;

            const queue = tx.getTable({ namespace: 'sys', name: 'sys_outsync_queue' });
            const now = Date.now();

            for (const event of events) {
                if (event.meta?.source === 'sync') continue;
                if (!['insert', 'update', 'delete'].includes(event.op)) continue;

                await queue.insert({
                    relation_id: tblDef.id,
                    origin,
                    query_spec: querySpec,
                    event_payload: event,
                    status: 'pending',
                    retry_count: 0,
                    last_error: null,
                    created_at: now,
                    updated_at: now,
                });
            }
        });
    }

    async #drainOutsyncQueue() {
        if (this.#isDrainingOutsync) return;
        this.#isDrainingOutsync = true;

        const queueRef = { namespace: 'sys', name: 'sys_outsync_queue' };
        const batchSize = this.#outsyncBatchSize;
        const processingTimeoutMs = this.#outsyncProcessingTimeoutMs;
        const remoteClientCache = new Map;

        try {
            while (true) {
                const items = await this.#storageEngine.transaction(async (tx) => {
                    const queue = tx.getTable(queueRef);

                    const rows = queue.getAll();
                    if (rows.length === 0) return [];

                    const now = Date.now();
                    const staleBefore = now - processingTimeoutMs;

                    const batch = rows
                        .filter((row) => {
                            const updatedAt = typeof row.updated_at === 'number' ? row.updated_at : 0;
                            const isStaleProcessing = row.status === 'processing' && updatedAt < staleBefore;
                            return row.status === 'pending' || row.status === 'error' || isStaleProcessing;
                        })
                        .sort((a, b) => a.id - b.id)
                        .slice(0, batchSize);

                    if (batch.length === 0) return [];

                    for (const row of batch) {
                        const updatedAt = typeof row.updated_at === 'number' ? row.updated_at : 0;
                        const isStaleProcessing = row.status === 'processing' && updatedAt < staleBefore;
                        const update = { status: 'processing', updated_at: now };
                        if (isStaleProcessing) {
                            update.retry_count = (row.retry_count || 0) + 1;
                            update.last_error = 'Processing timeout';
                        }
                        await queue.update(row, update);
                    }

                    return batch;
                });

                if (items.length === 0) break;

                for (const item of items) {
                    try {
                        const event = item.event_payload || {};

                        let remoteClient = remoteClientCache.get(item.origin);
                        if (!remoteClient) {
                            remoteClient = await this.getForeignClient(item.origin);
                            remoteClientCache.set(item.origin, remoteClient);
                        }
                        await this.#executeOutsyncItem(remoteClient, item, event);

                        await this.#storageEngine.transaction(async (tx) => {
                            const queue = tx.getTable(queueRef);
                            await queue.delete(item);
                        });
                    } catch (e) {
                        await this.#storageEngine.transaction(async (tx) => {
                            const queue = tx.getTable(queueRef);
                            await queue.update(item, {
                                status: 'error',
                                retry_count: (item.retry_count || 0) + 1,
                                last_error: String(e?.message || e),
                                updated_at: Date.now(),
                            });
                        });
                    }
                }
            }
        } finally {
            this.#isDrainingOutsync = false;
        }
    }

    async #executeOutsyncItem(remoteClient, item, event) {
        const outQueryObject = { ...item.query_spec, command: event.op };
        if (event.op === 'insert') {
            outQueryObject.payload = [{ ...(item.query_spec?.filters || {}), ...event.new }];
        } else {
            const keyCols = event.relation?.keyColumns || [];
            const key = Object.fromEntries(keyCols.map((k) => [k, event.old?.[k]]));
            outQueryObject.filters = { ...(item.query_spec?.filters || {}), ...key };
            if (event.op === 'update') outQueryObject.payload = event.new;
        }

        await remoteClient.query([outQueryObject]);
    }
    */
}
