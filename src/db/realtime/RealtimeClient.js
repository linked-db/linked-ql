import { normalizeQueryArgs, splitLogicalExpr } from '../abstracts/util.js';
import { AbstractClient } from '../abstracts/AbstractClient.js';
import { registry } from '../../lang/registry.js';
import { RealtimeResult } from './RealtimeResult.js';
import { QueryWindow } from './QueryWindow.js';

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
        const queryWindow = this.createWindow(query, options);
        const resultJson = await queryWindow.currentRendering();
        const realtimeResult = new RealtimeResult(resultJson, () => abortLines.forEach((c) => c()), signal);

        const changeHandler = callback || ((eventName, eventData) => realtimeResult._apply(eventName, eventData));
        const abortLines = ['result', 'diff', 'swap'].map((eventName) => {
            return queryWindow.on(eventName, (eventData) => changeHandler(eventName, eventData));
        });

        return realtimeResult;
    }

    createWindow(query) {
        const filterArray = splitLogicalExpr(query.whereClause()?.expr());
        const windowsByLongestFilters = [...this.#windows].sort((a, b) => a.filters.length > b.filters.length ? 1 : -1);
        const windowsByShortestFilters = [];
        // 1. Find a parent window...
        for (const window of windowsByLongestFilters) {
            if (!window.matchBase(query)) {
                // Query mismatch
                continue;
            }
            let _filters;
            if (_filters = window.matchFilters(filterArray)) {
                if (!_filters.size && window.matchProjection(query.selectList())) {
                    // Exact filters match and exact projection match
                    return window;
                }
                const newWindow = new QueryWindow(this.#driver, query, [..._filters]);
                newWindow.inherit(window);
                return newWindow;
            }
            windowsByShortestFilters.unshift(window);
        }
        // 2. Create afresh since no parent window
        const options = {};
        const newWindow = new QueryWindow(this.#driver, query, filterArray, options);
        // 3. Find a bind a child window...
        for (const window of windowsByShortestFilters) {
            if (_filters = newWindow.matchFilters(window.filters)) {
                window.inherit(newWindow);
                window.resetFilters([..._filters]);
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