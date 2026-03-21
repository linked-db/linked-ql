import '../../lang/index.js';
import { registry } from '../../lang/registry.js';
import { LinkedQLClient } from '../../clients/abstracts/LinkedQLClient.js';
import { normalizeQueryArgs } from '../../clients/abstracts/util.js';
import { RealtimeResult } from './RealtimeResult.js';
import { QueryWindow } from './QueryWindow.js';

export class RealtimeClient {

    #windows = new Set;
    #driver;

    get size() { return this.#windows.size; }

    constructor(driver) {
        if (!(driver instanceof LinkedQLClient)) {
            throw new TypeError('driver must be an instance of LinkedQLClient');
        }
        this.#driver = driver;
    }

    async query(...args) {
        const [query, { callback, signal, ...options }] = normalizeQueryArgs(...args);

        let queryWindow;
        let resultJson;

        if (options.id && (queryWindow = await this.findWindow(async (w) => await w.sync.hasSlot(options.id)))) {
            resultJson = callback
                ? { rows: [], hashes: [], mode: 'streaming_only' } // Resume streaming
                : await queryWindow.currentRendering();
        } else {
            queryWindow = await this.createWindow(query, options);
            resultJson = { ...await queryWindow.currentRendering(), mode: callback ? 'streaming' : 'live' };
        }

        const realtimeResult = new RealtimeResult(resultJson, async ({ forget = false } = {}) => {
            await unsubscribeCallback({ forget });
        }, signal);

        const changeHandler = callback || ((commit) => realtimeResult._apply(commit));
        const unsubscribeCallback = await queryWindow.sync.subscribe(changeHandler, { id: options.id });

        return realtimeResult;
    }

    async forget(id) {
        const queryWindow = await this.findWindow(async (w) => await w.sync.hasSlot(id));
        return !!queryWindow && await queryWindow.unsubscribe(id, { forget: true });
    }

    async findWindow(callback) {
        for (const window of this.#windows) {
            if (await callback(window)) return window;
        }
    }

    async createWindow(query, options) {
        if (!(query instanceof registry.BasicSelectStmt))
            throw new Error('Only SELECT statements are supported in live mode');

        if (!query.fromClause())
            throw new Error('Query has no FROM clause');

        const newWindow = new QueryWindow(this.#driver, query, options);

        const windows_depthFirst = [...this.#windows]
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
        this.#windows.add(newWindow);
        newWindow.onClose(() => {
            this.#windows.delete(newWindow);
            newWindow.stop();
        });

        return newWindow;
    }
}
