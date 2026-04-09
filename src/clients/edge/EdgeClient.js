import { BaseEdgeClient } from './BaseEdgeClient.js';
import { MessagePortPlus } from '@webqit/port-plus';
import { LiveResponse } from '@webqit/fetch-plus';
import { ConflictError } from '../../flashql/errors/ConflictError.js';

export class EdgeClient extends BaseEdgeClient {

    #url;
    #type;

    #fetch;
    #worker;

    #rowsStreaming;
    #workerEventNamespace;

    static #resolveWorkerPort(worker, type) {
        if (!worker) return worker;
        if (type === 'shared_worker') {
            return worker.port || worker;
        }
        return worker;
    }

    constructor({
        url,
        worker = null,
        type = 'http',
        rowsStreaming = 'port',
        workerEventNamespace = 'lnkd_',
        fetchApi = null,
        ...options
    }) {
        if (!url && !worker) throw new Error('No url or worker specified');
        if (!['http', 'worker', 'shared_worker'].includes(type))
            throw new Error(`Invalid type: ${type}`);

        super({ workerEventNamespace, ...options });

        this.#url = url;
        this.#type = type;

        this.#workerEventNamespace = workerEventNamespace;
        this.#rowsStreaming = rowsStreaming;

        if (this.#type === 'http') {
            this.#fetch = async (...args) => {
                return await (fetchApi || fetch)(...args);
            };
        } else {
            if (worker) {
                this.#worker = EdgeClient.#resolveWorkerPort(worker, this.#type);
            } else {
                const workerInstance = this.#type === 'shared_worker'
                    ? new SharedWorker(url, { type: 'module' })
                    : new Worker(url, { type: 'module' });
                this.#worker = EdgeClient.#resolveWorkerPort(workerInstance, this.#type);
            }
            MessagePortPlus.upgradeInPlace(this.#worker);
        }
    }

    async #callHttp(op, args, { liveMode, streamMode } = {}) {
        return await this.#fetch(`${this.#url}?op=${op}`, {
            body: JSON.stringify(args),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(streamMode && this.#rowsStreaming !== 'port'
                    ? {} : { 'Accept': 'application/json' }),
            },
        }).then(async (res) => {
            if (streamMode) {
                if (this.#rowsStreaming) {
                    const { port } = await LiveResponse.from(res).now();
                    return this.#portToAsyncIterable(port);
                } else return this.#streamToAsyncIterable(
                    res.body,
                    { parse: 'ndjson' }
                );
            }
            if (liveMode) return (
                ({ body: data, port }) => ({ data, port })
            )(await LiveResponse.from(res).now());
            return await res.json();
        });
    }

    async #callWorker(op, args, { liveMode, streamMode } = {}) {
        return await this.#worker.postRequest(
            { op, args },
            { once: !liveMode && !streamMode }
        ).then((e) => {
            if (e.data?.__error) {
                const error = e.data.__error.name === 'ConflictError'
                    ? new ConflictError(e.data.__error.message)
                    : new Error(e.data.__error.message);
                error.name = e.data.__error.name || error.name || 'Error';
                if (e.data.__error.stack) error.stack = e.data.__error.stack;
                throw error;
            }
            if (streamMode) return this.#portToAsyncIterable(e.target);
            if (liveMode) return { data: e.data, port: e.target };
            return e.data;
        });
    }

    async _exec(op, args, { liveMode = false, streamMode = false } = {}) {
        return this.#type === 'http'
            ? await this.#callHttp(op, args, { liveMode, streamMode })
            : await this.#callWorker(op, args, { liveMode, streamMode });
    }

    // ------------

    #portToAsyncIterable(port) {
        const workerEventNamespace = this.#workerEventNamespace;

        return {
            async *[Symbol.asyncIterator]() {
                let error = null;

                port.addEventListener(
                    `${workerEventNamespace}error`,
                    (e) => error = new Error(e.data.message),
                    { once: true }
                );

                const _nRows = () => {
                    return new Promise((res) => {
                        port.addEventListener(
                            `${workerEventNamespace}result`,
                            (e) => res(e.data),
                            { once: true }
                        );
                    });
                };

                try {
                    while (!error) {
                        const { rows, done } = await _nRows();
                        if (rows.length) yield* rows;
                        if (done) break;
                        port.postMessage('next', { type: 'ctrl' });
                    }
                } finally {
                    await port.close();
                }
            }
        };
    }

    #streamToAsyncIterable(stream, { parse = null } = {}) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();

        let finished = false;
        let buffer = '';

        const close = async () => {
            if (finished) return;
            finished = true;
            try {
                await reader.cancel();
            } catch { }
            reader.releaseLock();
        };

        return {
            async *[Symbol.asyncIterator]() {
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;

                        if (parse === 'ndjson') {
                            buffer += decoder.decode(value, { stream: true });

                            let lines = buffer.split('\n');
                            buffer = lines.pop(); // incomplete fragment

                            for (const line of lines) {
                                if (line.trim()) yield JSON.parse(line);
                            }

                            continue;
                        }

                        yield value;
                    }

                    if (parse === 'ndjson' && buffer.trim()) {
                        yield JSON.parse(buffer);
                    }
                } finally {
                    await close();
                }
            }
        };
    }
}
