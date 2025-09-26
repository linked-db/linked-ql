import { AbstractDriver } from '../abstracts/AbstractDriver.js';
import { normalizeQueryArgs, splitLogicalExpr } from '../abstracts/util.js';
import { registry } from '../../lang/registry.js';
import { RealtimeResult } from './RealtimeResult.js';
import { QueryWindow } from './QueryWindow.js';

export class RealtimeDriver extends AbstractDriver {

    #windows = new Set;
    #dbDriver;

    constructor(dbDriver) {
        super();
        if (!(dbDriver instanceof AbstractDriver)) {
            throw new TypeError('driver must be an instance of AbstractDriver');
        }
        if (dbDriver instanceof RealtimeDriver) {
            throw new Error(`driver cannot be an instance of RealtimeDriver`);
        }
        this.#dbDriver = dbDriver;
    }

    async query(...args) {
        const [query, options] = normalizeQueryArgs(true, ...args);
        if (!(query instanceof registry.BasicSelectStmt)) {
            throw new Error('Only SELECT statements are supported in live mode');
        }
        const queryWindow = this.createWindow(query);
        const resultJson = await queryWindow.initialResult();
        if (options.callback) {
            resultJson.abort = queryWindow.on('mutation', options.callback);
        } else {
            resultJson.abort = queryWindow.on('mutation', (event) => {
                realtimeResult._render(event);
            });
        }
        resultJson.signal = options.signal;
        const realtimeResult = new RealtimeResult(resultJson);
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
                const newWindow = new QueryWindow(this.#dbDriver, query, [..._filters]);
                newWindow.inherit(window);
                return newWindow;
            }
            windowsByShortestFilters.unshift(window);
        }
        // 2. Create afresh since no parent window
        const options = {};
        const newWindow = new QueryWindow(this.#dbDriver, query, filterArray, options);
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