import { AbstractClient } from '../abstracts/AbstractClient.js';
import { AbstractDriver } from '../abstracts/AbstractDriver.js';
import { normalizeQueryArgs, splitLogicalExpr } from '../abstracts/util.js';
import { QueryWindow } from './QueryWindow.js';

export class RealtimeClient extends AbstractClient {

    #windows = new Set;
    #driver;

    constructor(driver) {
        super();
        if (!(driver instanceof AbstractDriver)) {
            throw new TypeError('driver must be an instance of AbstractDriver');
        }
        this.#driver = driver;
    }

    async query(...args) {
        const [query, callback, options] = normalizeQueryArgs(true, ...args);
        if (!['BASIC_SELECT_STMT', 'COMPLETE_SELECT_STMT'].includes(query?.nodeName)) {
            throw new Error('Only SELECT statements are supported in RealtimeClient');
        }
        if (!callback) {
            throw new Error('A callback function must be provided for realtime queries');
        }
        const queryWindow = this.createWindow(query);
        const initialResult = await queryWindow.initialResult();
        const abortLine = queryWindow.on('mutation', callback);
        return initialResult;
    }

    createWindow(query) {
        const filterArray = splitLogicalExpr(query.where_clause?.expr);
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
                if (!_filters.size && window.matchProjection(query.select_list)) {
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
        newWindow.onClose(() => this.#windows.delete(newWindow))
        return newWindow;
    }
}