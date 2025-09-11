import { spawn, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export class WorkerPoolManager {
    constructor({
        workerScript = null,
        brokerScript = null,
        walSourceDescriptor = {},
        initialWorkers = 2,
        batchInterval = 50,
        scaleCheckInterval = 500,
        maxLoadPerWorker = 10
    } = {}) {

        const sql = (command) => `SELECT * FROM pg_${command}_replication_slot('linkedql_slot', 'wal2json')`;
        query(sql`drop`); // ignore errors
        query(sql`create_logical`).catch(err => {
            console.error('Failed to create replication slot:', err);
            process.exit(1);
        });

        const basePath = fileURLToPath(import.meta.url);
        this.workerScript = workerScript || join(basePath, '../stream/worker.js');
        this.brokerScript = brokerScript || join(basePath, '../stream/broker.js');
        this.walSourceDescriptor = walSourceDescriptor || {
            type: 'inline',
            connection: {
                host: 'localhost',
                user: 'postgres',
                password: 'postgres',
                database: 'mydb',
            },
            slot: 'linkedql_slot',
        };

        if (this.walSourceDescriptor.type === 'broker') {
            const brokerProc = spawn('node', [this.brokerScript], {
                env: { ...process.env, WAL_SOURCE: JSON.stringify(this.walSourceDescriptor), },
                stdio: 'inherit'
            });
            console.log(`[broker] started broker process (pid=${brokerProc.pid})`);
            brokerProc.on('exit', (code, signal) => {
                console.error(`Broker process exited (code=${code}, signal=${signal}), terminating...`);
                this.terminateAll();
                process.exit(1);
            });
        }

        this.workers = new Set; // now a Set for O(1) add/remove
        this.workerLoad = new Map;      // worker -> #subscriptions
        this.subscriptions = new Map;   // table -> worker
        this.callbacks = new Map;       // table -> Set of app-level callbacks
        this.batchInterval = batchInterval;
        this.scaleCheckInterval = scaleCheckInterval;
        this.maxLoadPerWorker = maxLoadPerWorker;

        for (let i = 0; i < initialWorkers; i++) {
            this._spawnWorker();
        }

        setInterval(() => this._autoScale(), this.scaleCheckInterval);
        setInterval(() => this._rebalanceSubscriptions(), this.scaleCheckInterval);
    }

    /** INTERNAL: spawn a single worker */
    _spawnWorker() {
        const env = { ...process.env, WAL_SOURCE: JSON.stringify(this.walSourceDescriptor) };
        const worker = fork(this.workerScript, [], { env });
        this.workerLoad.set(worker, 0);
        worker.queueLength = 0;

        worker.on('message', (msg) => {
            if (!msg || !msg.type) return;
            if (msg.type === 'patch' || msg.type === 'snapshot') {
                const cbs = this.callbacks.get(msg.table);
                for (const cb of cbs || []) {
                    cb(msg.patch || msg.snapshot);
                }
            } else if (msg.type === 'queueLength') {
                worker.queueLength = msg.length;
            }
        });

        worker.on('exit', (code, signal) => {
            console.warn(`Worker exited (code=${code}, signal=${signal}), respawning...`);
            this._reassignSubscriptions(worker);
            this._spawnWorker();
            this._removeWorker(worker);
        });

        this.workers.add(worker);
        return worker;
    }

    _leastLoadedWorker() {
        // iterate Set to find min
        let minWorker;
        for (const w of this.workers) {
            if (!minWorker || this.workerLoad.get(w) < this.workerLoad.get(minWorker)) {
                minWorker = w;
            }
        }
        return minWorker;
    }

    _assignWorker(table) {
        const worker = this._leastLoadedWorker();
        this.subscriptions.set(table, worker);
        this.workerLoad.set(worker, this.workerLoad.get(worker) + 1);
        worker.send({ type: 'subscribe', table, batchInterval: this.batchInterval });
        return worker;
    }

    _reassignSubscriptions(crashedWorker) {
        for (const [table, worker] of this.subscriptions.entries()) {
            if (worker === crashedWorker) {
                this.subscriptions.delete(table);
                const newWorker = this._assignWorker(table);
                console.log(`Reassigned table ${table} from crashed worker`);
            }
        }
    }

    _removeWorker(worker) {
        this.workerLoad.delete(worker);
        this.workers.delete(worker);
    }

    subscribe(table, callback) {
        if (!this.callbacks.has(table)) {
            this.callbacks.set(table, new Set());
        }
        this.callbacks.get(table).add(callback);
        this._assignWorker(table);
    }

    unsubscribe(table, callback = null) {
        const worker = this.subscriptions.get(table);
        if (!worker) return;

        if (callback) {
            const cbs = this.callbacks.get(table);
            cbs?.delete(callback);
            if (cbs.size === 0) {
                this._unsubscribeTableFromWorker(table, worker);
            }
        } else {
            this._unsubscribeTableFromWorker(table, worker);
        }
    }

    _unsubscribeTableFromWorker(table, worker) {
        worker.send({ type: 'unsubscribe', table });
        this.subscriptions.delete(table);
        this.callbacks.delete(table);
        this.workerLoad.set(worker, this.workerLoad.get(worker) - 1);
    }

    addWorker() { return this._spawnWorker(); }

    removeWorker(worker) {
        if (!this.workers.has(worker)) return;
        this._reassignSubscriptions(worker);
        worker.kill();
        this._removeWorker(worker);
    }

    _autoScale() {
        const avgQueue = this._avgWorkerQueue();
        if (avgQueue > this.maxLoadPerWorker) this.addWorker();
        else if (avgQueue < this.maxLoadPerWorker / 3 && this.workers.size > 1) {
            const worker = this._leastLoadedWorker();
            this.removeWorker(worker);
        }
    }

    _avgWorkerQueue() {
        let total = 0;
        for (const w of this.workers) total += w.queueLength || 0;
        return total / this.workers.size;
    }

    _rebalanceSubscriptions() {
        for (const worker of this.workers) {
            if (this.workerLoad.get(worker) > this.maxLoadPerWorker) {
                const tablesToMove = this._pickTablesToMove(worker);
                for (const table of tablesToMove) {
                    const targetWorker = this._leastLoadedWorker();
                    worker.send({ type: 'unsubscribe', table });
                    targetWorker.send({ type: 'subscribe', table, batchInterval: this.batchInterval });
                    this.subscriptions.set(table, targetWorker);
                    this.workerLoad.set(worker, this.workerLoad.get(worker) - 1);
                    this.workerLoad.set(targetWorker, this.workerLoad.get(targetWorker) + 1);
                }
            }
        }
    }

    _pickTablesToMove(worker) {
        const tables = [...this.subscriptions.entries()]
            .filter(([table, w]) => w === worker)
            .map(([table]) => table);
        return tables.slice(0, Math.ceil(tables.length / 2));
    }

    terminateAll() {
        for (const w of this.workers) w.kill();
        this.workers.clear();
    }
}
