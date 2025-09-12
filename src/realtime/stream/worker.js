import { SimpleEmitter } from '../engine/SimpleEmitter.js';
import { DBAdapter1 } from './DBAdapter1.js';
import { DBAdapter2 } from './DBAdapter2.js';
import { QueryWindow } from '../engine/QueryWindow.js';

export class Worker extends SimpleEmitter {

    #env;
    #dbAdapter;
    #abortLinesByComm = new Map;
    #windows = new Set;

    constructor(env) {
        super();
        if (!(env.DB_PARAMS && typeof env.DB_PARAMS === 'object')) {
            throw new Error('[worker] "env.DB_PARAMS" is a required parameter and must be a string.');
        }
        this.#env = env;
    }

    async start() {
        if (this.#env.DB_PARAMS.type === 'inline') {
            this.#dbAdapter = new DBAdapter1({
                mode: this.#env.DB_PARAMS.mode,
                connection: this.#env.DB_PARAMS.connection,
                slot: this.#env.DB_PARAMS.slot
            });
            await this.#dbAdapter.connect();
        } else {
            this.#dbAdapter = new DBAdapter2({
                mode: this.#env.DB_PARAMS.mode,
                host: this.#env.DB_PARAMS.host,
                port: this.#env.DB_PARAMS.port
            });
            await this.#dbAdapter.connect();
        }
        const reportQueueLength = () => {
            const total = [...patchBuffer.values()].reduce((s, a) => s + a.length, 0);
            this.emit('message', { messageType: 'report', queueLength: total });
        };
        //setInterval(() => reportQueueLength(), this.#env.REPORT_INTERVAL);
    }

    async handle(msg) {
        if (!msg || !msg.messageType) return;
        // Handle abort request
        if (msg.messageType === 'abort' && msg.messageId) {
            this.#abortLinesByComm.get(msg.messageId)?.();
            this.#abortLinesByComm.delete(msg.messageId);
            return;
        }
        // Handle query + subscribe request
        if (msg.messageType === 'query' && msg.query && msg.messageId) {
            // Create window
            const queryWindow = this.#createWindow(msg.query);

            // Run and sebd initial result
            const initialResult = await queryWindow.initialResult(true);
            this.emit('message', { messageType: 'result', messageId: msg.messageId, data: initialResult });

            // Bind to stream
            const abortLine = queryWindow.on('mutation', (event) => {
                this.emit('message', { messageType: 'mutation', messageId: msg.messageId, event });
            });
            this.#abortLinesByComm.set(msg.messageId, abortLine);
        }
    }

    #createWindow(query) {
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

    // ----------------------------

    static async autoRun() {
        const DB_PARAMS = JSON.parse(process.env.DB_PARAMS || 'null');
        const REPORT_INTERVAL = Number(process.env.REPORT_INTERVAL) || 200;
        const env = {
            DB_PARAMS,
            REPORT_INTERVAL,
        };
        try {
            const instance = new this(env);
            await instance.start();
            process.on('message', (msg) => instance.handle(msg));
            instance.on('message', (msg) => process.send?.(msg));
            return instance;
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    }
}