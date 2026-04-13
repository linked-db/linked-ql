import '../../lang/index.js';
import { registry } from '../../lang/registry.js';
import { LinkedQLClient } from '../../clients/abstracts/LinkedQLClient.js';
import { normalizeQueryArgs } from '../../clients/abstracts/util.js';
import { RealtimeResult } from './RealtimeResult.js';
import { QueryWindow } from './QueryWindow.js';
import { _eq } from '../../lang/abstracts/util.js';

export class RealtimeClient {

    #windows = new Set;
    #linkedQlClient;

    get size() { return this.#windows.size; }

    constructor(linkedQlClient) {
        if (!(linkedQlClient instanceof LinkedQLClient)) {
            throw new TypeError('linkedQlClient must be an instance of LinkedQLClient');
        }
        this.#linkedQlClient = linkedQlClient;
    }

    async query(...args) {
        const [query, { live: _, callback, signal, tx, id, initial, ...options }] = normalizeQueryArgs(...args);

        let queryWindow;
        let resultJson;

        if (id) {
            queryWindow = await this.findWindow(async (w) => {
                if (w.tx !== tx) return false;
                if (!_eq(w.options, options)) return false;
                if (!await w.wal.hasSlot(id)) return false;
                if (QueryWindow.intersectQueries(w.query, query) === false) return false;
                return true;
            });
            resultJson = queryWindow && { rows: [], hashes: [], initial: false, mode: callback ? 'callback' : 'live' };
        }

        if (!queryWindow) {
            queryWindow = await this.createWindow(query, { tx, ...options });
            const initialResult = initial === false
                ? { initial: false }
                : { ...await queryWindow.currentRendering(), initial: true };
            resultJson = { ...initialResult, mode: callback ? 'callback' : 'live' };
        }

        const realtimeResult = new RealtimeResult(resultJson, async ({ forget = false } = {}) => {
            return await abortLine({ forget });
        }, signal);

        const changeHandler = callback || ((commit) => realtimeResult._apply(commit));
        const abortLine = await queryWindow.wal.subscribe(changeHandler, { id });

        return realtimeResult;
    }

    async forget(id) {
        const queryWindow = await this.findWindow(async (w) => await w.wal.hasSlot(id));
        return !!queryWindow && await queryWindow.wal.forget(id);
    }

    async findWindow(callback) {
        for (const window of this.#windows) {
            if (await callback(window)) return window;
        }
    }

    async createWindow(query, { tx, ...options }) {
        if (!(query instanceof registry.BasicSelectStmt))
            throw new Error('Only SELECT statements are supported in live mode');

        if (!query.fromClause())
            throw new Error('Query has no FROM clause');

        const newWindow = new QueryWindow(this.#linkedQlClient, query, { tx, ...options });

        const windows_depthFirst = [...this.#windows].filter((w) => w.tx === newWindow.tx)
            .sort((a, b) => a.inheritanceDepth > b.inheritanceDepth ? 1 : -1);
        const potentialSubWindows = [];

        // 1. Try inheriting a window. We're searching depth-first
        for (const potentialParentWindow of windows_depthFirst) {
            if (await newWindow.inherit(potentialParentWindow)) break;
            potentialSubWindows.unshift(potentialParentWindow);
        }

        // 2. No parent window found. We run as root
        if (!newWindow.parentWindow) {
            await newWindow.start();
            // Try parenting an existing window. This time, we're searching depth-last
            for (const potentialSubWindow of potentialSubWindows) {
                if (await potentialSubWindow.inherit(newWindow)) break;
            }
        }

        // Register
        const abortWatch = newWindow.on('error', (e) => this.#linkedQlClient.emit('error', e));
        this.#windows.add(newWindow);
        newWindow.onClose(() => {
            this.#windows.delete(newWindow);
            newWindow.stop();
            abortWatch();
        });

        return newWindow;
    }
}
