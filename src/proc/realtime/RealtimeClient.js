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

        if (options.id && (queryWindow = await this.findWindow(async (w) => await w.wal.hasSlot(options.id)))) {
            resultJson = { rows: [], hashes: [], initial: false, mode: callback ? 'callback' : 'live' };
        } else {
            queryWindow = await this.createWindow(query, options);
            const initial = options.initial === false
                ? { initial: false }
                : { ...await queryWindow.currentRendering(), initial: true };
            resultJson = { ...initial, mode: callback ? 'callback' : 'live' };
        }

        const realtimeResult = new RealtimeResult(resultJson, async ({ forget = false } = {}) => {
            return await abortLine({ forget });
        }, signal);

        const changeHandler = callback || ((commit) => realtimeResult._apply(commit));
        const abortLine = await queryWindow.wal.subscribe(changeHandler, { id: options.id });

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
        const abortWatch = newWindow.on('error', (e) => this.#driver.emit('error', e));
        this.#windows.add(newWindow);
        newWindow.onClose(() => {
            this.#windows.delete(newWindow);
            newWindow.stop();
            abortWatch();
        });

        return newWindow;
    }
}
