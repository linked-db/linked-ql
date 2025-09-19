import { AbstractClient } from '../abstracts/AbstractClient.js';
import { AbstractDriver } from '../abstracts/AbstractDriver.js';
import { normalizeQueryArgs } from '../abstracts/util.js';
import { QueryWindow } from './QueryWindow.js';

export class RealtimeClient extends AbstractClient {

    #windows = new Set;
    #dbAdapter;

    constructor(dbAdapter) {
        super();
        if (!(dbAdapter instanceof AbstractDriver)) {
            throw new TypeError('dbAdapter must be an instance of AbstractDriver');
        }
        this.#dbAdapter = dbAdapter;
    }

    async query(...args) {
        const [query, options] = normalizeQueryArgs(...args);
        const queryWindow = this.createWindow(query);
        const initialResult = await queryWindow.initialResult();
        const abortLine = queryWindow.on('mutation', (event) => {
            this.emit('message', { messageType: 'mutation', messageId: msg.messageId, event });
        });
        return initialResult;
    }

    createWindow(query) {
        const filterArray = QueryWindow.splitLogic(query.where_clause?.expr);
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
                const newWindow = new QueryWindow(this.#dbAdapter, query, [..._filters]);
                newWindow.inherit(window);
                return newWindow;
            }
            windowsByShortestFilters.unshift(window);
        }
        // 2. Create afresh since no parent window
        const options = {};
        const newWindow = new QueryWindow(this.#dbAdapter, query, filterArray, options);
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