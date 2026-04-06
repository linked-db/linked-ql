import { MessagePortPlus } from '@webqit/port-plus';
import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';

export class EdgeWorker extends SimpleEmitter {

    static webWorker({ worker = self, ...options }) {
        const instance = new EdgeWorker({ ...options, type: 'worker' });

        MessagePortPlus.upgradeInPlace(worker);
        worker.addRequestListener('message', async (e) => {
            const { data: { op, args }, ports: [port] } = e;

            await instance.handle(op, args, port);
        });

        return instance;
    }

    static sharedWorker({ worker = self, ...options }) {
        const instance = new EdgeWorker({ ...options, type: 'shared_worker' });

        worker.addEventListener('connect', (e) => {
            const port = e.ports?.[0];
            if (!port) return;

            MessagePortPlus.upgradeInPlace(port);
            port.addRequestListener('message', async (evt) => {
                const { data: { op, args }, ports: [replyPort] } = evt;
                await instance.handle(op, args, replyPort);
            });
        });

        return instance;
    }

    static http({ ...options }) {
        const instance = new EdgeWorker({ ...options, type: 'http' });
        return instance;
    }

    // -------------

    #db;
    get db() { return this.#db; }

    #type;
    get type() { return this.#type; }

    #rowsStreaming;
    #workerEventNamespace;


    #transactions = new Map;
    #transactionCounter = 0;

    constructor({
        db,
        type = 'http',
        rowsStreaming = 'port',
        workerEventNamespace = 'lnkd_',
    }) {
        super();

        if (!db) throw new Error('No db client specified');
        if (!['http', 'worker', 'shared_worker'].includes(type))
            throw new Error(`Invalid type: ${type}`);

        this.#db = db;
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
            const db = this.#db;
            if (typeof db._beginTransaction !== 'function') {
                throw new Error('Client does not support explicit transactions');
            }

            const tx = await db._beginTransaction(options);
            const id = tx.id || `tx_${++this.#transactionCounter}`;
            this.#transactions.set(id, tx);
            return { id };
        };

        const commitTransaction = async (id) => {
            const db = this.#db;
            const tx = this.#transactions.get(id);
            if (!tx) throw new Error(`Unknown transaction id: ${id}`);
            if (typeof db._commitTransaction !== 'function') {
                throw new Error('Client does not support explicit transactions');
            }
            this.#transactions.delete(id);
            await db._commitTransaction(tx);
            return true;
        };

        const rollbackTransaction = async (id) => {
            const db = this.#db;
            const tx = this.#transactions.get(id);
            if (!tx) throw new Error(`Unknown transaction id: ${id}`);
            if (typeof db._rollbackTransaction !== 'function') {
                throw new Error('Client does not support explicit transactions');
            }
            this.#transactions.delete(id);
            await db._rollbackTransaction(tx);
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

            result = await this.#db.query(args.query, resolveTx(args.options));
            return result;
        }

        if (op === 'stream') {
            const asyncIterable = await this.#db.stream(args.query, resolveTx(args.options));

            if (this.#type === 'http' && this.#rowsStreaming !== 'port') {
                return asyncIterable;
            }

            if (!port) throw new Error('Port required');

            liveModeCallback?.();
            return await this.#streamCursorOverPort(asyncIterable, port, args.options?.batchSize);
        }

        // -----------

        if (op === 'resolver:show_create') {
            return (await this.#db.resolver.showCreate(args.selector, args.options)).map((sch) => sch.jsonfy());
        }

        if (op === 'parser:parse') {
            return (await this.#db.parser.parse(args.query, args.options)).jsonfy();
        }

        if (op === 'wal:subscribe') {
            if (!port) throw new Error('Port required');
            liveModeCallback?.();

            args.callback = (commit) =>
                port.postMessage({ commit }, { type: `${this.#workerEventNamespace}commit` });

            const gc = args.selector
                ? await this.#db.wal.subscribe(args.selector, args.callback, args.options)
                : await this.#db.wal.subscribe(args.callback, args.options);
            port.readyStateChange('close').then(gc);
            return;
        }

        if (op === 'wal:forget') {
            return await this.#db.wal.forget(args.id);
        }

        if (op === 'live:forget') {
            return await this.#db.live.forget(args.id);
        }

        if (op === 'sync:sync') {
            return await this.#db.sync?.sync(args.selector, args.options);
        }

        if (op === 'wal:handle_downstream_commit') {
            return await this.#db.wal.handleDownstreamCommit(args.commit, args.options);
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
