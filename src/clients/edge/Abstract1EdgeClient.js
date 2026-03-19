import { registry } from '../../lang/registry.js';
import { Abstract0SQLClient } from '../abstracts/Abstract0SQLClient.js';
import { RealtimeResult } from '../../proc/realtime/RealtimeResult.js';
import { SQLParser } from '../../lang/SQLParser.js';
import { Result } from '../Result.js';

export class Abstract1EdgeClient extends Abstract0SQLClient {

    #parser;
    #workerEventNamespace;
    #realtimeMode;

    #realtime;
    #gcArray = [];

    get parser() { return this.#parser; }

    constructor({ workerEventNamespace, realtimeMode = 0, ...options }) {
        super(options);
        this.#parser = SQLParser({ dialect: options.dialect });
        this.#workerEventNamespace = workerEventNamespace;
        this.#realtimeMode = realtimeMode;
    }

    // ------------

    async showCreate(selector, structured = false) {
        const responseJson = await this._showCreate(selector, structured);
        if (!responseJson) return;
        return registry.JSONSchema.fromJSON(
            { entries: responseJson },
            { assert: true }
        ).entries();
    }

    async parse(querySpec, { preferRemote = false, alias = null, dynamicWhereMode = false, ...options } = {}) {
        if (!preferRemote) {
            return await this.#parser.parse(querySpec, { alias, dynamicWhereMode, ...options });
        }

        if (dynamicWhereMode) {
            return async (dynamicWhere) => {
                const responseJson = await this._parse(querySpec, { alias, dynamicWhereMode, ...options, dynamicWhere });
                return this.#loadAST(responseJson, options);
            };
        }

        const responseJson = await this._parse(querySpec, { alias, ...options });
        return this.#loadAST(responseJson, options);
    }

    async resolve(query, options) {
        const responseJson = await this._resolve(query, options);
        return this.#loadAST(responseJson, options);
    }

    async query(query, { callback, signal, ...options }) {
        const responseJson = await this._query(query, { callback, signal, ...options });
        if (!responseJson) return;

        let result;

        if (options.live) {
            if (!responseJson?.port) throw new Error('Could not obtain upstream port');
    
            const gcArray = [];

            result = new RealtimeResult(responseJson.data, () => {
                // When RealtimeResult.abort() is called or signal aborts
                gcArray.splice(0).forEach((c) => c());
                responseJson.port.close();
            }, signal);

            if (callback) {
                // Server knows to send events instead of mutate result rows
                const handleEvents = (e) => callback(e.data.eventName, e.data.eventData);
                responseJson.port.addEventListener(`${this.#workerEventNamespace}event`, handleEvents);
                gcArray.push(() => responseJson.port.removeEventListener(`${this.#workerEventNamespace}event`, handleEvents));
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
        return await this._stream(query, options);
    }

    async subscribe(...args) {
        if (this.#realtimeMode === 1) {
            return await this.#subscribe(...args);
        }
        return super.subscribe(...args);
    }

    // ------------

    async #subscribe(...args) {
        const callback = args.pop();
        if (typeof callback !== 'function') {
            throw new Error(`Callback is not a function`);
        }

        const gcArray = [];

        const responseJson = await this._subscribe(...args);
        if (!responseJson?.port) throw new Error('Could not obtain upstream port');

        responseJson.port.readyStateChange('close').then(() => {
            gcArray.splice(0).forEach((c) => c());
        });

        const handleEvents = (e) => callback(e.data);
        responseJson.port.addEventListener(`${this.#workerEventNamespace}event`, handleEvents);
        gcArray.push(() => responseJson.port.removeEventListener(`${this.#workerEventNamespace}event`, handleEvents));

        const gc = () => responseJson.port?.close();
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

    // ------------

    async _setupRealtime() {
        if (this.#realtime
            || this.#realtimeMode === 1) return;
        this.#realtime = await this.#subscribe((events) => this._fanout(events));
    }

    async _teardownRealtime() {
        if (!this.#realtime) return;
        this.#realtime();
        this.#realtime = null;
    }

    async _disconnect() {
        this.#gcArray.splice(0).forEach((c) => c());
    }
}