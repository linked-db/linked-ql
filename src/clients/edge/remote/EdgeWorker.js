import { SimpleEmitter } from '../../abstracts/SimpleEmitter.js';
import { EdgeHttpHandler } from './EdgeHttpHandler.js';
import { EdgeWebWorkerRuntime } from './EdgeWebWorkerRuntime.js';
import { EdgeSharededgeWorkerRuntime } from './EdgeSharedWorkerRuntime.js';

export class EdgeWorker extends SimpleEmitter {

    static httpWorker(options) {
        const edgeWorker = new this({ ...options, type: 'http' });
        return new EdgeHttpHandler(edgeWorker);
    }

    static webWorker(options) {
        const edgeWorker = new this({ ...options, type: 'worker' });
        return new EdgeWebWorkerRuntime(edgeWorker);
    }

    static sharedWorker(options) {
        const edgeWorker = new this({ ...options, type: 'shared_worker' });
        return new EdgeSharededgeWorkerRuntime(edgeWorker);
    }

    // -------------

    #db;
    get db() { return this.#db; }

    #type;
    get type() { return this.#type; }

    #workerEventNamespace;

    #transactions = new Map;

    constructor({
        db,
        type = 'http',
        workerEventNamespace = 'lnkd_',
    }) {
        super();

        if (!db) throw new Error('No db client specified');
        if (!['http', 'worker', 'shared_worker'].includes(type))
            throw new Error(`Invalid type: ${type}`);

        this.#db = db;
        this.#type = type;

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
        const resolveTx = (options = {}, isParentTx = false) => {
            const key = isParentTx ? 'parentTx' : 'tx';
            if (!options || !options[key]) return options;

            const tx = this.#transactions.get(options[key].id);
            if (!tx) throw new Error(`Unknown transaction id: ${options[key].id}`);

            return { ...options, [key]: tx };
        };

        if (op === 'transaction:begin') {
            const db = this.#db;
            const options = resolveTx(args.options || {}, true);
            const tx = await db.begin(options);

            this.#transactions.set(tx.id, tx);
            return { id: tx.id };
        }

        if (op === 'transaction:commit') {
            const tx = this.#transactions.get(args.id);
            if (!tx) throw new Error(`Unknown transaction id: ${args.id}`);

            this.#transactions.delete(args.id);
            await tx.commit();

            return true;
        }

        if (op === 'transaction:rollback') {
            const tx = this.#transactions.get(args.id);
            if (!tx) throw new Error(`Unknown transaction id: ${args.id}`);

            this.#transactions.delete(args.id);
            await tx.rollback();

            return true;
        }

        if (op === 'query') {
            let result;

            if (args.options?.live) {
                if (!port) throw new Error('Port required for live query requests');
                liveModeCallback?.(new Promise(() => { }));

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

            const options = resolveTx(args.options);
            result = await this.#db.query(args.query, options);
            return result;
        }

        if (op === 'stream') {
            const options = resolveTx(args.options);
            const asyncIterable = await this.#db.stream(args.query, options);

            if (this.#type === 'http' && !args.options?.portBasedStreaming) {
                return asyncIterable;
            }

            if (!port) throw new Error('Port required');

            const streamingPromise = this.#streamCursorOverPort(asyncIterable, port, args.options?.batchSize);
            liveModeCallback?.(streamingPromise);
            return;
        }

        // -----------

        if (op === 'resolver:show_create') {
            const options = resolveTx(args.options);
            return (await this.#db.resolver.showCreate(args.selector, options)).map((sch) => sch.jsonfy());
        }

        if (op === 'parser:parse') {
            return (await this.#db.parser.parse(args.query, args.options)).jsonfy();
        }

        if (op === 'wal:subscribe') {
            if (!port) throw new Error('Port required');
            liveModeCallback?.(new Promise(() => { }));

            args.callback = (commit) =>
                port.postMessage({ commit }, { type: `${this.#workerEventNamespace}commit` });

            const options = resolveTx(args.options);

            const walSub = args.selector
                ? await this.#db.wal.subscribe(args.selector, args.callback, options)
                : await this.#db.wal.subscribe(args.callback, options);

            port.readyStateChange('close').then(() => walSub.abort());

            walSub.on('error', (e) => {
                if (port.readyState !== 'closed') {
                    port.postMessage({ message: e.message }, { type: `${this.#workerEventNamespace}error` });
                }
            });
            
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
            return await this.#db.wal.applyDownstreamCommit(args.commit, args.options);
        }
    }

    async #streamCursorOverPort(iterator, port, batchSize = 100) {
        if (iterator[Symbol.asyncIterator]) {
            iterator = await iterator[Symbol.asyncIterator]();
        }

        const gc = async () => {
            try {
                await iterator.return?.();
            } catch (e) { }
        };
        port.readyStateChange('close').then(gc);

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

        try {
            do await _sendN(batchSize); while (await _signal('next'));
        } catch (err) {
            port.postMessage({ message: err.message }, { type: `${this.#workerEventNamespace}error` });
        } finally {
            await gc();
        }
    }
}
