import '../../lang/index.js';
import { AbstractClient } from '../abstracts/AbstractClient.js';
import { RealtimeResult } from './RealtimeResult.js';
import { QueryWindow } from './QueryWindow.js';
import { registry } from '../../lang/registry.js';
import { normalizeQueryArgs } from '../abstracts/util.js';

export class RealtimeClient {

    #windows = new Set;
    #driver;

    constructor(driver) {
        super();
        if (!(driver instanceof AbstractClient)) {
            throw new TypeError('driver must be an instance of AbstractClient');
        }
        this.#driver = driver;
    }

    async query(...args) {
        const [query, { callback, signal, ...options }] = normalizeQueryArgs(true, ...args);
        if (!(query instanceof registry.BasicSelectStmt)) {
            throw new Error('Only SELECT statements are supported in live mode');
        }
        const queryWindow = await this.createWindow(query, options);
        const resultJson = await queryWindow.currentRendering();
        const realtimeResult = new RealtimeResult(resultJson, () => abortLines.forEach((c) => c()), signal);

        const changeHandler = callback || ((eventName, eventData) => realtimeResult._apply(eventName, eventData));
        const abortLines = ['result', 'diff', 'swap'].map((eventName) => {
            return queryWindow.on(eventName, (eventData) => changeHandler(eventName, eventData));
        });

        return realtimeResult;
    }

    async createWindow(query, options) {
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
            newWindow.disconnect();
        });

        return newWindow;
    }
}
