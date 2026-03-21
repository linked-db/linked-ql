import { registry } from '../../lang/registry.js';
import { LinkedQLClient } from '../abstracts/LinkedQLClient.js';
import { RealtimeResult } from '../../proc/realtime/RealtimeResult.js';
import { SchemaInference } from './SchemaInference.js';
import { SyncEngine } from './SyncEngine.js';
import { SQLParser } from './SQLParser.js';
import { Result } from '../Result.js';

export class BaseEdgeClient extends LinkedQLClient {

    // Standard getters: parsers, resolver, sync

    #parser;
    #sync;

    get parser() { return this.#parser; }
    get resolver() {
        return super.resolveGetResolver(() =>
            new SchemaInference({ client: this }));
    }
    get sync() { return this.#sync; }

    // Internal

    #workerEventNamespace;

    #realtimeGc;
    #gcArray = [];

    // ------------

    constructor({ workerEventNamespace, ...options }) {
        super(options);

        this.#workerEventNamespace = workerEventNamespace;

        this.#parser = new SQLParser({ dialect: this.dialect });
        this.#sync = new SyncEngine({
            client: this,
            drainMode: 'drain',
            lifecycleHook: async (status) => {
                await this.setCapability({ realtime: !!status });
            }
        });
    }

    async disconnect() {
        await Promise.all(this.#gcArray.splice(0).map((c) => c()));
        await super.disconnect();
    }

    // ------------

    async query(query, { callback, signal, ...options }) {
        const responseJson = await this._exec(
            'query',
            { query, options: { callback: !!callback, ...options } },
            { liveMode: options.live }
        );
        if (!responseJson) return;

        let result;

        if (options.live) {
            if (!responseJson?.port) throw new Error('Could not obtain upstream port');

            const gcArray = [];

            result = new RealtimeResult(responseJson.data, async ({ forget = false }) => {
                if (forget && options.id) {
                    const result = await responseJson.port.postRequest('forget');
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

    async stream(query, options) {
        return await this._exec(
            'stream',
            { query, options },
            { streamMode: true }
        );
    }

    // ------------

    // Called by this.resolver.showCreate() for yet-to-be-cached schemas
    async _showCreate(selector, options = {}) {
        const responseJson = await this._exec('resolver:show_create', { selector, options });
        if (!responseJson) return;
        return registry.JSONSchema.fromJSON(
            { entries: responseJson },
            { assert: true }
        ).entries();
    }

    // Called by this.#parser.parse() if options.preferRemote
    async _parse(query, { preferRemote = false, alias = null, dynamicWhereMode = false, ...options } = {}) {
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

    // Called by this.#sync.subscribe() if options.preferRemote
    async _subscribe(...args) {
        return await this.#subscribe(...args);
    }

    // ------------

    async _setupRealtime() {
        if (this.#realtimeGc) return;
        this.#realtimeGc = await this.#subscribe(async (commit) => this.#sync.dispatch(commit));
    }

    async _teardownRealtime() {
        if (!this.#realtimeGc) return;
        await this.#realtimeGc();
        this.#realtimeGc = null;
    }

    // ------------

    async #subscribe(...args) {
        const selector = typeof args[0] !== 'function' ? args.shift() : undefined;
        const callback = args.shift();
        if (typeof callback !== 'function') {
            throw new Error(`Callback must be a function`);
        }
        const options = args.shift() || {};

        const gcArray = [];

        const responseJson = await this._exec('sync:subscribe', { selector, options }, { liveMode: true });
        if (!responseJson?.port) throw new Error('Could not obtain upstream port');

        responseJson.port.readyStateChange('close').then(async () => {
            await Promise.all(gcArray.splice(0).map((c) => c()));
        });

        const handleCommit = (e) => callback(e.data.commit);
        responseJson.port.addEventListener(`${this.#workerEventNamespace}commit`, handleCommit);
        gcArray.push(() => responseJson.port.removeEventListener(`${this.#workerEventNamespace}commit`, handleCommit));

        const gc = async ({ forget = false }) => {
            responseJson.port?.close();

            if (forget && options.id) {
                return await this._exec('sync:forget', { id: options.id });
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