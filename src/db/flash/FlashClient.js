import { AbstractClient } from '../abstracts/AbstractClient.js';
import { matchSchemaSelector, normalizeSchemaSelectorArg } from '../abstracts/util.js';
import { StorageEngine } from './StorageEngine.js';
import { QueryEngine } from './QueryEngine.js';
import { registry } from '../../lang/registry.js';
import { ConflictError } from './ConflictError.js';

export class FlashClient extends AbstractClient {

    #dialect;

    #storageEngine;
    #queryEngine;

    #realtimeAbortLine;

    get dialect() { return this.#dialect; }
    get storageEngine() { return this.#storageEngine; }

    constructor({ dialect = 'postgres', capability = {}, ...options } = {}, storageEngine = null) {
        super({ capability });
        this.#dialect = dialect;
        this.#storageEngine = storageEngine || new StorageEngine({ dialect, ...options });
        this.#queryEngine = new QueryEngine(this.#storageEngine, { dialect, ...options });
    }

    async _connect() { }

    async _disconnect() { }

    async _query(query, options) {
        return await this.#queryEngine.query(query, options);
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
        return await this._query(query, options);
    }

    async _showCreate(selector, schemaWrapped = false) {
        selector = normalizeSchemaSelectorArg(selector);
        const schemas = [];
        for (const namespaceName of await this.#storageEngine.namespaceNames()) {
            const objectNames = Object.entries(selector).reduce((arr, [_namespaceName, objectNames]) => {
                return matchSchemaSelector(namespaceName, [_namespaceName])
                    ? arr.concat(objectNames)
                    : arr;
            }, []);
            if (!objectNames.length) continue;

            // Schema def:
            const schemaSchemaJson = {
                nodeName: 'SCHEMA_SCHEMA',
                name: { nodeName: 'SCHEMA_IDENT', value: namespaceName },
                entries: [],
            };

            // Schema tables:
            const namespaceObject = await this.#storageEngine.getNamespace(namespaceName);
            for (const tbl of await namespaceObject.tableNames()) {
                if (!matchSchemaSelector(tbl, objectNames)) continue;
                const tableStorage = await namespaceObject.getTable(tbl);
                const tableSchemaJson = tableStorage.schema.jsonfy();
                tableSchemaJson.name.qualifier = { nodeName: 'SCHEMA_REF', value: namespaceName };
                (schemaWrapped
                    ? schemaSchemaJson.entries
                    : schemas).push(registry.TableSchema.fromJSON(tableSchemaJson, { dialect: this.dialect }));
            }

            if (schemaWrapped) {
                schemas.push(registry.SchemaSchema.fromJSON(schemaSchemaJson, { dialect: this.dialect }));
            }
        }

        return schemas;
    }

    async _setupRealtime() {
        if (this.#realtimeAbortLine) return; // Indempotency
        this.#realtimeAbortLine = this.#queryEngine.on('changefeed', (events) => this._fanout(events));
    }

    async _teardownRealtime() {
        this.#realtimeAbortLine?.();
        this.#realtimeAbortLine = null;
    }

    // --------- FlashQL extras

    async federate(...args) {
        const [specifiers, options, remoteClient] = this._normalizeOriginSpec(true, ...args);
        return await this._federate(specifiers, options, remoteClient);
    }

    async materialize(...args) {
        const [specifiers, options, remoteClient] = this._normalizeOriginSpec(true, ...args);
        return await this._materialize(specifiers, options, remoteClient);
    }

    async sync(...args) {
        const [specifiers, options, remoteClient] = this._normalizeOriginSpec(false, ...args);
        return await this._sync(specifiers, options, remoteClient);
    }

    // --------- standard client hooks

    async _federate(specifiers, options, remoteClient, materializeCallback = null) {
        const storageEngine = this.#storageEngine;
        const queryCtx = { transaction: await storageEngine.startTransaction('~sync~init') };

        for (const [namespaceName, queryObjects] of specifiers.entries()) {
            const namespaceObject = await storageEngine.createNamespace(namespaceName, { ifNotExists: options.ifNotExists, mirrored: true, materialized: !!materializeCallback, origin: remoteClient }, queryCtx);

            for (const querySpec of queryObjects) {
                const [query] = await remoteClient._normalizeQueryArgs(querySpec.query || { ...querySpec, command: 'select', columns: ['*'] });

                const firstFromtItem = query.fromClause().entries()[0];
                const tableName = firstFromtItem.alias()?.value();

                if (!tableName) throw new Error(`Couldn't resolve ${query} to a valid local table name`);

                const tableIdent = { nodeName: registry.Identifier.NODE_NAME, value: tableName };
                const tableSchema = registry.TableSchema.fromJSON({
                    name: tableIdent,
                    entries: query.resultSchema().entries().map((e) => e.jsonfy()),
                }, { assert: true });

                const tableStorage = await namespaceObject.createTable(
                    tableSchema,
                    { ifNotExists: options.ifNotExists, mirrored: true, materialized: !!materializeCallback, querySpec },
                    queryCtx
                );
                if (materializeCallback) {
                    await materializeCallback(tableStorage, query, queryCtx);
                }
            }
        }

        await queryCtx.transaction.done();
    }

    async _materialize(specifiers, options, remoteClient) {
        const keyOpts = { keyName: '~sync' };
        const abortLines = [];

        await this._federate(specifiers, options, remoteClient, async (tableStorage, query, queryCtx) => {
            // Inser records
            let stream, hashes = [];
            if (options.live) {
                const result = await remoteClient.query(
                    query,
                    (eventName, eventData) => this._handleInSync(tableStorage, eventName, eventData),
                    { live: true }
                );
                ({ rows: stream, hashes } = result);
                abortLines.push(result.abort.bind(result));
            } else stream = await remoteClient.cursor(query);

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

    async _sync(specifiers, options, remoteClient) {
        const syncInAbortLine = await this._materialize(specifiers, { ...options, live: true }, remoteClient);
        const abortLines = [syncInAbortLine];

        for (const [namespaceName, queryObjects] of specifiers.entries()) {
            for (const querySpec of queryObjects) {
                abortLines.push(await this.subscribe(
                    { [namespaceName]: [querySpec.table.name] },
                    (events) => this._handleOutSync(events, querySpec, remoteClient)
                ));
            }
        }

        return () => abortLines.forEach((c) => c());
    }

    async _handleInSync(tableStorage, eventName, eventData) {
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

    async _handleOutSync(events, querySpec, remoteClient) {
        const outQueryObjects = [];

        for (const event of events) {
            if (event.txId.startsWith('~sync')) continue;

            const outQueryObject = { command: event.type, table: querySpec.table };

            if (event.type === 'insert') {
                outQueryObject.payload = [{ ...(querySpec.where || {}), ...event.new }];
            } else if (event.type === 'update' || event.type === 'delete') {
                const key = event.key || Object.fromEntries(event.relation.keyColumns.map((k) => [k, event.old[k]]));
                outQueryObject.where = { ...(querySpec.where || {}), ...key };

                if (event.type === 'update') {
                    outQueryObject.payload = event.new;
                }
            }

            outQueryObjects.push(registry.Script.build(outQueryObject, { dialect: remoteClient.dialect }));
        }

        if (outQueryObjects.length) {
            // TODO: implement an outbound queue for these quesries and handle failures
            const result = await remoteClient.query(outQueryObjects.join(';'));
        }
    }

    _normalizeOriginSpec(allowQueries, ...args) {
        const spec = args.shift();
        const remoteClient = args.pop(); // Last arg
        const options = args.pop() || {}; // Middle, optional arg

        if (!(typeof spec === 'object' && spec) || Array.isArray(spec)) {
            throw new TypeError('First argument must be a non-array object spec');
        }
        if (!(remoteClient instanceof AbstractClient)) {
            throw new Error(`Last argument must be an instance of AbstractClient`);
        }

        const specifiers = new Map;

        for (const namespaceName in spec) {
            specifiers.set(namespaceName, new Set);

            for (const subSpec of [].concat(spec[namespaceName])) {
                const tableSpec = {};
                let query, where;
                if (typeof subSpec === 'string') {
                    specifiers.get(namespaceName).add({
                        table: { schema: namespaceName, name: subSpec },
                    });
                } else {
                    let keys;
                    if (!(typeof subSpec === 'object' && subSpec)
                        || !(keys = Object.keys(subSpec)).length
                        || keys.filter((k) => k !== 'schema' && k !== 'name' && k !== 'query' && k !== 'where').length
                        || (!subSpec.query && !subSpec.name)) {
                        throw new SyntaxError(`Given table spec ${JSON.stringify(tableSpec)} invalid`);
                    }

                    if (subSpec.query) {
                        if (!allowQueries) throw new SyntaxError(`Arbitrary queries found in ${JSON.stringify(tableSpec)} but not supported on this operation`);
                        if (subSpec.schema || subSpec.name || subSpec.where)
                            throw new SyntaxError(`Mutually-exclusive attributes detected in ${JSON.stringify(tableSpec)}`);

                        specifiers.get(namespaceName).add({ query });
                    } else {
                        if (subSpec.where && typeof subSpec.where !== 'object')
                            throw new SyntaxError(`Given where spec ${JSON.stringify(tableSpec)} invalid`);

                        specifiers.get(namespaceName).add({
                            table: { schema: subSpec.schema || namespaceName, name: subSpec.name },
                            where: subSpec.where
                        });
                    }
                }
            }
        }

        return [specifiers, options, remoteClient];
    }
}