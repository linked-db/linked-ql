import { AbstractSQLClient } from '../abstracts/AbstractSQLClient.js';
import { matchRelationSelector, normalizeRelationSelectorArg } from '../abstracts/util.js';
import { StorageEngine } from './StorageEngine.js';
import { QueryEngine } from './QueryEngine.js';
import { registry } from '../../lang/registry.js';
import { ConflictError } from './ConflictError.js';
import { AbstractAPIClient } from './api/AbstractAPIClient.js';

export class FlashClient extends AbstractSQLClient {

    #dialect;

    #storageEngine;
    #queryEngine;

    #onCreateRemoteClient;
    #remoteClients = new Map;

    #realtimeAbortLine;

    get dialect() { return this.#dialect; }
    get storageEngine() { return this.#storageEngine; }

    constructor({ dialect = 'postgres', capability = {}, onCreateRemoteClient = null, ...options } = {}, storageEngine = null) {
        super({ capability });
        this.#dialect = dialect;
        this.#storageEngine = storageEngine || new StorageEngine({ dialect, ...options });
        this.#queryEngine = new QueryEngine(this.#storageEngine, { dialect, ...options });
        this.#onCreateRemoteClient = onCreateRemoteClient;
    }

    async _connect() { }

    async _disconnect() { }

    async _query(query, options) {
        const unmaterializedMirrors = await this.#storageEngine.showMirrors({ materialized: false });
        const effectiveMirrorsSpec = new Map;

        if (unmaterializedMirrors.size) {
            let resolutionHint = 0;
            query.walkTree((v) => {
                let nsName,
                    tblName;
                if (v instanceof registry.TableRef1
                    && (nsName = v.qualifier()?.value())
                    && (tblName = v.value())) {
                    const nsDef = unmaterializedMirrors.get(nsName);
                    const tblDef = nsDef?.tables.get(tblName);
                    if (!tblDef) return;

                    if (!effectiveMirrorsSpec.has(nsName)) {
                        effectiveMirrorsSpec.set(nsName, { type: nsDef.type, origin: nsDef.origin, tables: new Map });
                    }
                    effectiveMirrorsSpec.get(nsName).tables.set(tblName, tblDef);

                    if (nsDef.type === 'API'
                        || tblDef?.querySpec.query
                        || tblDef.querySpec.namespace !== nsName) {
                        resolutionHint = -1;
                    } else if (resolutionHint !== -1) {
                        resolutionHint = 1;
                    }
                } else return v;
            }, true);

            let lastClient;
            for (const nsDef of effectiveMirrorsSpec.values()) {
                lastClient = await this.getRemoteClient(nsDef.origin);
                nsDef.client = lastClient;
            }

            if (resolutionHint === 1
                && effectiveMirrorsSpec.size === 1) {
                return await lastClient.query(query, options);
            }
        }

        return await this.#queryEngine.query(query, { ...options, effectiveMirrorsSpec });
    }

    async _cursor(query, options) {
        let closed = false;
        return {
            async *[Symbol.asyncIterator]() {
                const { rows } = await this._query(query, options);
                for await (const row of rows) {
                    if (closed) return;
                    yield row;
                }
            },
            async close() { closed = true; },
        };
    }

    async _showCreate(selector, structured = false) {
        selector = normalizeRelationSelectorArg(selector);
        const namespaceSchemas = [];
        for (const nsName of await this.#storageEngine.namespaceNames()) {

            const objectNames = Object.entries(selector).reduce((arr, [_namespaceName, objectNames]) => {
                return matchRelationSelector(nsName, [_namespaceName])
                    ? arr.concat(objectNames)
                    : arr;
            }, []);
            if (!objectNames.length) continue;

            // Schema def:
            const namespaceJson = {
                nodeName: registry.NamespaceSchema.NODE_NAME,
                name: { nodeName: registry.NamespaceIdent.NODE_NAME, value: nsName },
                entries: [],
            };

            // Schema tables:
            const namespaceObject = await this.#storageEngine.getNamespace(nsName);
            for (const tblName of await namespaceObject.tableNames()) {
                if (!matchRelationSelector(tblName, objectNames)) continue;
                const tableStorage = await namespaceObject.getTable(tblName);
                const tableSchemaJson = tableStorage.schema.jsonfy();
                tableSchemaJson.name.nodeName = registry.TableIdent.NODE_NAME;
                tableSchemaJson.name.qualifier = { nodeName: registry.NamespaceRef.NODE_NAME, value: nsName };
                (structured
                    ? namespaceJson.entries
                    : namespaceSchemas).push(registry.TableSchema.fromJSON(tableSchemaJson, { assert: true, dialect: this.dialect }));
            }

            if (structured) {
                namespaceSchemas.push(registry.NamespaceSchema.fromJSON(namespaceJson, { dialect: this.dialect }));
            }
        }

        return namespaceSchemas;
    }

    async _setupRealtime() {
        if (this.#realtimeAbortLine) return; // Indempotency
        this.#realtimeAbortLine = this.#storageEngine.on('changefeed', (events) => this._fanout(events));
    }

    async _teardownRealtime() {
        this.#realtimeAbortLine?.();
        this.#realtimeAbortLine = null;
    }

    // --------- FlashQL extras

    async subscribe(selector, callback) {
        if (typeof selector === 'function') return super.subscribe(selector);

        const unmaterializedMirrors = await this.#storageEngine.showMirrors({ materialized: false });
        if (unmaterializedMirrors.size) {

            const abortLines = [];
            const relationSelector = normalizeRelationSelectorArg(selector);

            const localMap = {}, remoteMapMap = {};
            for (const [nsName, tblNames] of Object.entries(relationSelector)) {
                const remoteTablesMap = unmaterializedMirrors.get(nsName)?.tables;
                if (remoteTablesMap) {
                    for (const tblName of tblNames) {
                        const remoteNsName = remoteTablesMap.get(tblName)?.querySpec.namespace || '*';
                        // querySpec.query explocitly excluded from here
                        if (remoteNsName) {
                            if (!remoteMapMap[nsName]) remoteMapMap[nsName] = {};
                            if (!remoteMapMap[nsName][remoteNsName]) remoteMapMap[nsName][remoteNsName] = [];
                            remoteMapMap[nsName][remoteNsName].push(tblName);
                        } else {
                            if (!localMap[nsName]) localMap[nsName] = [];
                            localMap[nsName].push(tblName);
                        }
                    }
                } else {
                    localMap[nsName] = tblNames;
                }
            }

            if (Object.keys(localMap).length) {
                abortLines.push(await super.subscribe(localMap, callback));
            }
            for (const nsName in remoteMapMap) {
                const remoteClient = await this.getRemoteClient(unmaterializedMirrors.get(nsName).origin);
                abortLines.push(await remoteClient.subscribe(remoteMapMap[nsName], (events) => {
                    events = events.map((e) => ({ ...e, relation: { ...e.relation, namespace: nsName } }));
                    callback(events);
                }));
            }

            return () => abortLines.forEach((c) => c());
        }

        return super.subscribe(selector, callback);
    }

    async federate(...args) {
        const [specifiers, options, origin] = this.#normalizeMirroringSpec(true, ...args);
        return await this.#federate(specifiers, options, origin);
    }

    async materialize(...args) {
        const [specifiers, options, origin] = this.#normalizeMirroringSpec(true, ...args);
        return await this.#materialize(specifiers, options, origin);
    }

    async sync(...args) {
        const [specifiers, options, origin] = this.#normalizeMirroringSpec(false, ...args);
        return await this.#sync(specifiers, options, origin);
    }

    async getRemoteClient(origin) {
        if (!this.#onCreateRemoteClient)
            throw new Error(`Cannot process remote operation; missing options.onCreateRemoteClient`);
        if (!this.#remoteClients.has(origin)) { // TODO: derive stable hashing
            this.#remoteClients.set(origin, await this.#onCreateRemoteClient(origin));
        }
        return this.#remoteClients.get(origin);
    }

    // --------- standard client hooks

    async #federate(specifiers, options, origin, materializeCallback = null) {
        const storageEngine = this.#storageEngine;
        const queryCtx = { transaction: await storageEngine.startTransaction('~sync~init') };
        const remoteClient = await this.getRemoteClient(origin);

        for (const [nsName, queryObjects] of specifiers.entries()) {
            const namespaceObject = await storageEngine.createNamespace(nsName, { ifNotExists: options.ifNotExists, type: options.type, mirrored: true, origin }, queryCtx);

            for (const querySpec of queryObjects) {
                const query = await remoteClient.resolve(querySpec);
                const tableSchema = registry.TableSchema.fromJSON({
                    name: { nodeName: registry.Identifier.NODE_NAME, value: querySpec.name },
                    entries: query.resultSchema().entries().map((e) => e.jsonfy()),
                }, { assert: true });

                const tableStorage = await namespaceObject.createTable(
                    tableSchema,
                    { ifNotExists: options.ifNotExists, materialized: !!materializeCallback, querySpec },
                    queryCtx
                );

                if (materializeCallback) {
                    await materializeCallback(tableStorage, query, queryCtx, remoteClient);
                }
            }
        }

        await queryCtx.transaction.done();
    }

    async #materialize(specifiers, options, origin) {
        const keyOpts = { keyName: '~sync' };
        const abortLines = [];

        await this.#federate(specifiers, options, origin, async (tableStorage, query, queryCtx, remoteClient) => {
            await tableStorage.createKey(keyOpts.keyName);
            // Inser records
            let stream, hashes = [];
            if (options.live) {
                const result = await remoteClient[remoteClient instanceof AbstractAPIClient ? 'query' : 'request'](
                    query,
                    (eventName, eventData) => this.#handleInSync(tableStorage, eventName, eventData),
                    { live: true }
                );
                ({ rows: stream, hashes } = result);
                abortLines.push(result.abort.bind(result));
            } else stream = await remoteClient[remoteClient instanceof AbstractAPIClient ? 'cursor' : 'stream'](query);

            let i = 0;
            for await (const row of stream) {
                try {
                    await tableStorage.insert(row, hashes[i] && { ...keyOpts, newKey: hashes[i] }, queryCtx);
                } catch (e) {
                    if (e instanceof ConflictError) {
                        if (!options.ifNotExists) {
                            await tableStorage.update(e.existing, row, hashes[i] && { ...keyOpts, newKey: hashes[i] }, queryCtx);
                        }
                    } else throw e;
                }
                i++;
            }
        });

        return () => abortLines.forEach((c) => c());
    }

    async #sync(specifiers, options, origin) {
        const inSyncAbortLine = await this.#materialize(specifiers, { ...options, live: true }, origin);
        const abortLines = [inSyncAbortLine];

        for (const [nsName, queryObjects] of specifiers.entries()) {
            for (const querySpec of queryObjects) {
                abortLines.push(await this.subscribe(
                    { [nsName]: [querySpec.name] },
                    (events) => this.#handleOutSync(events, querySpec, origin)
                ));
            }
        }

        return () => abortLines.forEach((c) => c());
    }

    async #handleInSync(tableStorage, eventName, eventData) {
        const storageEngine = this.#storageEngine;
        const queryCtx = { transaction: await storageEngine.startTransaction('~sync~in') };
        const keyOpts = { keyName: '~sync' };

        if (eventName === 'diff') {
            for (let event of eventData) {
                if (event.type === 'update') {
                    const existing = await tableStorage.get(event.newHash, keyOpts);

                    if (existing) {
                        await tableStorage.update(event.oldHash, event.new, { ...keyOpts, newKey: event.newHash }, queryCtx);
                    } else {
                        event = { ...event, type: 'insert' };
                    }
                }

                if (event.type === 'insert') {
                    await tableStorage.insert(event.new, { ...keyOpts, newKey: event.newHash }, queryCtx);
                }

                if (event.type === 'delete') {
                    await tableStorage.delete(event.newHash, keyOpts, queryCtx);
                }
            }
        }

        if (eventName === 'swap') {
            const displaced = new Map;

            for (const [hash, targetHash] of eventData) {
                const sourceRecord = displaced.get(hash)
                    || await tableStorage.get(hash, keyOpts);

                const targetRedord = await tableStorage.get(targetHash, keyOpts);
                displaced.set(targetHash, targetRedord);

                await tableStorage.update(targetHash, sourceRecord, keyOpts);
            }
        }

        if (eventName === 'result') {
            const keys = await tableStorage.showKeys(keyOpts.keyName);
            const allKeys = [...eventData.hashes, ...keys];

            let existing;
            for (let i = 0; i < allKeys.length; i++) {
                if (!eventData.rows[i]) {
                    await tableStorage.delete(allKeys[i], keyOpts, queryCtx);
                } else if (existing = await tableStorage.get(allKeys[i], keyOpts)) {
                    if (_eq(eventData.rows[i], existing)) continue;
                    await tableStorage.update(allKeys[i], eventData.rows[i], keyOpts, queryCtx);
                } else {
                    await tableStorage.insert(eventData.rows[i], { ...keyOpts, newKey: allKeys[i] }, queryCtx);
                }
            }
        }

        await queryCtx.transaction.done();
    }

    async #handleOutSync(events, querySpec, origin) {
        const outQueryObjects = [];

        for (const event of events) {
            if (event.txId.startsWith('~sync')) continue;

            const outQueryObject = { ...querySpec, command: event.type };

            if (event.type === 'insert') {
                outQueryObject.payload = [{ ...(querySpec.filters || {}), ...event.new }];
            } else if (event.type === 'update' || event.type === 'delete') {
                const key = event.key || Object.fromEntries(event.relation.keyColumns.map((k) => [k, event.old[k]]));
                outQueryObject.filters = { ...(querySpec.filters || {}), ...key };

                if (event.type === 'update') {
                    outQueryObject.payload = event.new;
                }
            }

            outQueryObjects.push(outQueryObject);
        }

        if (outQueryObjects.length) {
            // TODO: implement an outbound queue for these quesries and handle failures
            //const remoteClient = await this.getRemoteClient(origin);
            //const result = await remoteClient.query(outQueryObjects.join(';'));
        }
    }

    #normalizeMirroringSpec(allowQueries, ...args) {
        const spec = args.shift();
        const origin = args.pop(); // Last arg
        const options = args.pop() || {}; // Middle, optional arg

        if (!(typeof spec === 'object' && spec) || Array.isArray(spec)) {
            throw new TypeError('Mirroring spec must be a non-array object spec');
        }
        if (!origin || !['object', 'string'].includes(typeof origin)) {
            throw new TypeError('Origin spec must be a string or an object');
        }

        const specifiers = new Map;

        for (const nsName in spec) {
            specifiers.set(nsName, new Set);

            for (const subSpec of [].concat(spec[nsName])) {
                const tableSpec = {};

                if (typeof subSpec === 'string') {
                    if (options.type === 'API') {
                        specifiers.get(nsName).add({
                            name: subSpec,
                        });
                    } else {
                        specifiers.get(nsName).add({
                            namespace: nsName,
                            name: subSpec,
                        });
                    }
                } else {
                    let keys;
                    if (!(typeof subSpec === 'object' && subSpec)
                        || !(keys = Object.keys(subSpec)).length
                        || keys.filter((k) => k !== 'namespace' && k !== 'name' && k !== 'query' && k !== 'url' && k !== 'filters' && k !== 'joinStrategy').length) {
                        throw new SyntaxError(`Given table spec ${JSON.stringify(subSpec)} invalid`);
                    }

                    if (!subSpec.name)
                        throw new SyntaxError(`Missing attribute "name" in ${JSON.stringify(subSpec)}`);

                    if (options.type === 'API') {
                        if (subSpec.query)
                            throw new SyntaxError(`Unsupported attribute "query" in API-type mirror spec: ${JSON.stringify(subSpec)}`);
                        if (subSpec.namespace || subSpec.filters)
                            throw new SyntaxError(`Mutually-exclusive attributes "namespace|filters" in ${JSON.stringify(subSpec)}`);
                        specifiers.get(nsName).add({
                            name: subSpec.name,
                            url: subSpec.url,
                            joinStrategy: subSpec.joinStrategy
                        });
                    } else {
                        if (subSpec.url)
                            throw new SyntaxError(`Unsupported attribute "url" in SQL-type mirror spec: ${JSON.stringify(subSpec)}`);
                        if (subSpec.query) {
                            if (!allowQueries)
                                throw new SyntaxError(`Arbitrary queries ${JSON.stringify(tableSpec)} not supported on this operation`);
                            if (subSpec.namespace || subSpec.filters)
                                throw new SyntaxError(`Mutually-exclusive attributes "namespace|filters" in ${JSON.stringify(subSpec)}`);
                            specifiers.get(nsName).add({
                                name: subSpec.name,
                                query: subSpec.query,
                                joinStrategy: subSpec.joinStrategy
                            });
                        } else {
                            if (subSpec.filters && typeof subSpec.filters !== 'object')
                                throw new SyntaxError(`Invalid attribute "filter" in ${JSON.stringify(subSpec)}`);
                            specifiers.get(nsName).add({
                                namespace: subSpec.namespace || nsName,
                                name: subSpec.name,
                                filters: subSpec.filters,
                                joinStrategy: subSpec.joinStrategy
                            });
                        }
                    }
                }
            }
        }

        return [specifiers, options, origin];
    }
}