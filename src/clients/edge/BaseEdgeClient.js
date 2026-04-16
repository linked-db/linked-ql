import { registry } from '../../lang/registry.js';
import { LinkedQLClient } from '../abstracts/LinkedQLClient.js';
import { AbstractNode } from '../../lang/abstracts/AbstractNode.js';
import { RealtimeResult } from '../../proc/realtime/RealtimeResult.js';
import { normalizeQueryArgs } from '../abstracts/util.js';
import { EdgeSchemaInference } from './abstracts/EdgeSchemaInference.js';
import { EdgeSQLParser } from './abstracts/EdgeSQLParser.js';
import { EdgeWal } from './abstracts/EdgeWal.js';
import { Result } from '../Result.js';

export class BaseEdgeClient extends LinkedQLClient {

    // Standard getters: parsers, resolver, wal

    #parser;
    #wal;
    #live;
    #sync;

    get parser() { return this.#parser; }
    get resolver() {
        return super.resolveGetResolver(() =>
            new EdgeSchemaInference({ edgeClient: this }));
    }
    get wal() { return this.#wal; }
    get live() { return this.#live; }
    get sync() { return this.#sync; }

    // Internal

    #workerEventNamespace;

    #gcArray = [];

    // ------------

    constructor({ workerEventNamespace, ...options }) {
        super(options);

        this.#workerEventNamespace = workerEventNamespace;

        this.#parser = new EdgeSQLParser({ dialect: this.dialect });
        this.#wal = new EdgeWal({
            edgeClient: this,
            drainMode: 'drain'
        });
        this.#live = {
            forget: async (id) => await this._exec('live:forget', { id }),
        };
        this.#sync = {
            sync: async (selector = '*', { forceSync = false } = {}) => await this._exec('sync:sync', { selector, options: { forceSync } }),
        };
    }

    async disconnect() {
        await Promise.all(this.#gcArray.splice(0).map((c) => c()));
        await super.disconnect();
    }

    async begin(options = {}) {
        const tx = await this._exec('transaction:begin', { options });
        const txApi = {
            ...tx,
            commit: async () => await this._exec('transaction:commit', tx),
            rollback: async () => await this._exec('transaction:rollback', tx),
        };
        return txApi;
    }

    async transaction(cb, options = {}) {
        if (typeof cb !== 'function') {
            throw new TypeError('transaction(cb): cb must be a function');
        }

        const txApi = await this.begin(options);

        try {
            const result = await cb(txApi);
            await txApi.commit();
            return result;
        } catch (e) {
            await txApi.rollback();
            throw e;
        }
    }

    // ------------

    async query(...args) {
        let [query, { callback, signal, tx: inputTx, ...options }] = normalizeQueryArgs(...args);
        const tx = inputTx ? { id: inputTx.id } : null;

        if (query instanceof AbstractNode) query = query.jsonfy();

        const responseJson = await this._exec(
            'query',
            { query, options: { callback: !!callback, ...options, tx } },
            { liveMode: options.live }
        );
        if (!responseJson) return;

        let result;

        if (options.live) {
            if (!responseJson?.port) throw new Error('Could not obtain upstream port');

            const gcArray = [];

            result = new RealtimeResult(responseJson.data, async ({ forget = false }) => {
                if (forget && options.id) {
                    const result = await new Promise((resolve) => {
                        responseJson.port.postRequest(null, (e) => resolve(e.data), { once: true, type: 'forget' });
                    });
                    if (typeof result !== 'boolean')
                        throw new Error('Could not execute forget() on remote stream');
                }

                // When RealtimeResult.abort() is called or signal aborts
                gcArray.splice(0).forEach((c) => c());
                responseJson.port.close();
            }, signal);

            if (callback) {
                // Server knows to send events instead of mutate result rows
                const handleCommit = (e) => callback(e.data.commit);
                responseJson.port.addEventListener(`${this.#workerEventNamespace}commit`, handleCommit);
                gcArray.push(() => responseJson.port.removeEventListener(`${this.#workerEventNamespace}commit`, handleCommit));
            }

            const gc = () => result.abort();
            responseJson.port?.readyStateChange('close').then(gc);
            this.#gcArray.push(gc);
        } else {
            result = new Result(responseJson);
        }

        return result;
    }

    async stream(...args) {
        let [query, { tx: inputTx, ...options }] = normalizeQueryArgs(...args);
        const tx = inputTx ? { id: inputTx.id } : null;

        if (query instanceof AbstractNode) query = query.jsonfy();

        return await this._exec(
            'stream',
            { query, options: { ...options, tx } },
            { streamMode: true }
        );
    }

    // ------------

    // Called by this.resolver.showCreate() for yet-to-be-cached schemas
    async _showCreate(selector, { tx: inputTx, ...options } = {}) {
        const tx = inputTx ? { id: inputTx.id } : null;

        const responseJson = await this._exec('resolver:show_create', { selector, options: { ...options, tx } });
        if (!responseJson) return;

        return registry.JSONSchema.fromJSON(
            { entries: responseJson },
            { assert: true }
        ).entries();
    }

    // Called by this.#parser.parse() if options.preferRemote
    async _parse(query, { preferRemote = false, alias = null, dynamicWhereMode = false, ...options } = {}) {
        if (query instanceof AbstractNode) query = query.jsonfy();

        const parseWith = async (options) => await this._exec('parser:parse', { query, options });

        if (dynamicWhereMode) {
            return async (dynamicWhere) => {
                const responseJson = await parseWith({ ...options, alias, dynamicWhereMode, dynamicWhere });
                return this.#loadAST(responseJson, options);
            };
        }

        const responseJson = await parseWith({ ...options, alias });
        return this.#loadAST(responseJson, options);
    }

    // Called by this.#wal.subscribe() if options.preferRemote
    async _subscribe(...args) {
        return await this.#subscribe(...args);
    }

    // ------------

    async #subscribe(...args) {
        const selector = typeof args[0] !== 'function' ? args.shift() : undefined;
        const callback = args.shift();
        if (typeof callback !== 'function') {
            throw new Error(`Callback must be a function`);
        }
        const _options = args.shift() || {};
        const { tx: inputTx, ...options } = _options;
        const tx = inputTx ? { id: inputTx.id } : null;

        const gcArray = [];

        const responseJson = await this._exec('wal:subscribe', { selector, options: { ...options, tx } }, { liveMode: true });
        if (!responseJson?.port) throw new Error('Could not obtain upstream port');

        responseJson.port.readyStateChange('close').then(async () => {
            await Promise.all(gcArray.splice(0).map((c) => c()));
        });

        const handleCommit = (e) => callback(e.data.commit);
        responseJson.port.addEventListener(`${this.#workerEventNamespace}commit`, handleCommit);
        gcArray.push(() => responseJson.port.removeEventListener(`${this.#workerEventNamespace}commit`, handleCommit));

        const gc = async ({ forget = false } = {}) => {
            responseJson.port?.close();

            if (forget && options.id) {
                return await this._exec('wal:forget', { id: options.id });
            }
        };
        this.#gcArray.push(gc);

        return gc;
    }

    #loadAST(responseJson, options) {
        if (!responseJson) return;
        if (responseJson.nodeName === registry.SQLScript.NODE_NAME) {
            return registry.SQLScript.fromJSON(responseJson, {
                dialect: options.dialect,
                assert: true,
                supportStdStmt: true
            });
        }
        if (Array.isArray(responseJson)) {
            return registry.SQLScript.fromJSON(
                { entries: responseJson },
                { dialect: options.dialect, assert: true, supportStdStmt: true }
            ).entries();
        }
        return registry.SQLScript.fromJSON(
            { entries: [responseJson] },
            { dialect: options.dialect, assert: true, supportStdStmt: true }
        ).entries()[0];
    }
}
