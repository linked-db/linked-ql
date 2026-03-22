import { MessagePortPlus } from '@webqit/port-plus';

export class EdgeWorker {

    static webWorker(options) {
        MessagePortPlus.upgradeInPlace(self);

        const worker = new EdgeWorker({ ...options, type: 'worker' });

        self.addRequestListener('message', async (e) => {
            const { data: { op, args }, ports: [port] } = e;

            await worker.handle(op, args, port);
        });
    }

    // -------------

    #client;
    get client() { return this.#client; }

    #type;
    get type() { return this.#type; }

    #rowsStreaming;
    #workerEventNamespace;

    
    #transactions = new Map;
    #transactionCounter = 0;

    constructor({
        client,
        type = 'http',
        rowsStreaming = 'port',
        workerEventNamespace = 'lnkd_',
    }) {
        if (!client) throw new Error('No client specified');
        if (!['http', 'worker', 'shared_worker'].includes(type))
            throw new Error(`Invalid type: ${type}`);

        this.#client = client;
        this.#type = type;

        this.#rowsStreaming = rowsStreaming;
        this.#workerEventNamespace = workerEventNamespace;
    }

    async handle(op, args, port, liveModeCallback = null) {
        const _result = await this.exec(op, args, port, liveModeCallback);
        const result = typeof _result === 'object' && _result?.toJSON
            ? _result.toJSON()
            : _result;

        if (this.#type === 'http') {
            return result;
        }

        if (result) {
            const live = op === 'query' && args.options?.live && !args.options?.callback;
            port.postMessage(result, { live });
        }
    }

    async exec(op, args, port, liveModeCallback = null) {
        const resolveTx = (options = {}) => {
            if (!options || !options.tx) return options;

            const tx = this.#transactions.get(options.tx);
            if (!tx) {
                throw new Error(`Unknown transaction id: ${options.tx}`);
            }

            return { ...options, tx };
        };

        const beginTransaction = async (options = {}) => {
            const client = this.#client;
            if (typeof client._beginTransaction !== 'function') {
                throw new Error('Client does not support explicit transactions');
            }

            const tx = await client._beginTransaction(options);
            const id = `tx_${++this.#transactionCounter}`;
            this.#transactions.set(id, tx);
            return { id };
        };

        const commitTransaction = async (id) => {
            const client = this.#client;
            const tx = this.#transactions.get(id);
            if (!tx) throw new Error(`Unknown transaction id: ${id}`);
            if (typeof client._commitTransaction !== 'function') {
                throw new Error('Client does not support explicit transactions');
            }
            this.#transactions.delete(id);
            await client._commitTransaction(tx);
            return true;
        };

        const rollbackTransaction = async (id) => {
            const client = this.#client;
            const tx = this.#transactions.get(id);
            if (!tx) throw new Error(`Unknown transaction id: ${id}`);
            if (typeof client._rollbackTransaction !== 'function') {
                throw new Error('Client does not support explicit transactions');
            }
            this.#transactions.delete(id);
            await client._rollbackTransaction(tx);
            return true;
        };

        if (op === 'transaction:begin') {
            return await beginTransaction(args.options || {});
        }

        if (op === 'transaction:commit') {
            return await commitTransaction(args.id);
        }

        if (op === 'transaction:rollback') {
            return await rollbackTransaction(args.id);
        }

        if (op === 'query') {
            let result;

            if (args.options?.live) {
                if (!port) throw new Error('Port required for live query requests');
                liveModeCallback?.();

                if (args.options.callback === true) {
                    args.options.callback = (commit) =>
                        port.postMessage({ commit }, { type: `${this.#workerEventNamespace}commit` });
                }

                port.addRequestListener('forget', async () => {
                    return await result?.abort({ forget: true });
                });

                const gc = async () => await result?.abort();
                port.readyStateChange('close').then(gc);
            }

            result = await this.#client.query(args.query, resolveTx(args.options));
            return result;
        }

        if (op === 'stream') {
            const asyncIterable = await this.#client.stream(args.query, resolveTx(args.options));

            if (this.#type === 'http' && this.#rowsStreaming !== 'port') {
                return asyncIterable;
            }

            if (!port) throw new Error('Port required');

            liveModeCallback?.();
            return await this.#streamCursorOverPort(asyncIterable, port, args.options?.batchSize);
        }

        // -----------

        if (op === 'resolver:show_create') {
            return await this.#client.resolver.showCreate(args.selector, args.options);
        }

        if (op === 'parser:parse') {
            return await this.#client.parser.parse(args.query, args.options);
        }

        if (op === 'wal:subscribe') {
            if (!port) throw new Error('Port required');
            liveModeCallback?.();

            args.callback = (commit) =>
                port.postMessage({ commit }, { type: `${this.#workerEventNamespace}commit` });

            const gc = args.selector
                ? await this.#client.wal.subscribe(args.selector, args.callback, args.options)
                : await this.#client.wal.subscribe(args.callback, args.options);
            port.readyStateChange('close').then(gc);
            return;
        }

        if (op === 'wal:forget') {
            return await this.#client.wal.unsubscribe(args.id, { forget: true });
        }
    }

    async #streamCursorOverPort(iterator, port, batchSize = 100) {
        if (iterator[Symbol.asyncIterator]) {
            iterator = await iterator[Symbol.asyncIterator]();
        }

        const gc = () => iterator.return?.();
        port.readyStateChange('close').then(gc).catch(() => { });

        const _signal = (sig) => {
            return new Promise((res) => {
                port.addEventListener(
                    'ctrl',
                    (e) => res(e.data === sig),
                    { once: true }
                );
            });
        };

        const _sendN = async (batchSize) => {
            const rows = [];
            let value, done;

            while (rows.length < batchSize) {
                ({ value, done } = await iterator.next());
                if (done) break;
                rows.push(value);
            }

            port.postMessage({ rows, done }, { type: `${this.#workerEventNamespace}result` });
            return !done;
        };

        (async () => {
            try {
                do await _sendN(batchSize); while (await _signal('next'));
            } catch (err) {
                port.postMessage({ message: err.message }, { type: `${this.#workerEventNamespace}error` });
            } finally {
                port.close();
            }
        })();
    }
}
