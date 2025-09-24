import { AbstractClient } from './abstracts/AbstractClient.js';
import { AbstractDriver } from './abstracts/AbstractDriver.js';
import { ProxyServer } from './classic/ProxyServer.js';
import { Client } from './Client.js';

export class Pool extends AbstractClient {


    #dbParams;
    #poolParams;

    #serverProcess;
    #workerProcesses = new Set;
    #workerLoadStats = new Map;

    #batchInterval;
    #scaleCheckInterval;
    #maxLoadPerWorker;

    constructor(dbParams, poolParams = {}) {
        super();
        if (dbParams instanceof AbstractDriver) {
            throw new TypeError('dbParams must be a plain object');
        }
        this.#dbParams = dbParams;
        this.#poolParams = poolParams;

        this.#batchInterval = poolParams.batchInterval;
        this.#scaleCheckInterval = poolParams.scaleCheckInterval;
        this.#maxLoadPerWorker = poolParams.maxLoadPerWorker;

        this.#serverProcess = ProxyServer.spawn({
            env: { ...process.env, DB_PARAMS: JSON.stringify(this.#dbParams), },
            stdio: 'inherit'
        });
        this.#serverProcess.on('exit', (code, signal) => {
            this.emit('error', new Error(`Proxy Server process exited (code=${code}, signal=${signal}), terminating...`));
            this.terminateAll();
            process.exit(1);
        });

        for (let i = 0; i < poolParams.initialWorkers || 2; i++) {
            this.#spawnWorker();
        }
        setInterval(() => this.#autoScale(), this.#scaleCheckInterval);
        setInterval(() => this.#rebalanceSubscriptions(), this.#scaleCheckInterval);

        this.subscriptions = new Map;   // table -> workerProcess
        this.callbacks = new Map;       // table -> Set of app-level callbacks
    }

    subscribe(table, callback) {
        if (!this.callbacks.has(table)) {
            this.callbacks.set(table, new Set());
        }
        this.callbacks.get(table).add(callback);
        this.#assignWorker(table);
    }

    unsubscribe(table, callback = null) {
        const workerProcess = this.subscriptions.get(table);
        if (!workerProcess) return;

        if (callback) {
            const cbs = this.callbacks.get(table);
            cbs?.delete(callback);
            if (cbs.size === 0) {
                this.#unsubscribeTableFromWorker(table, workerProcess);
            }
        } else {
            this.#unsubscribeTableFromWorker(table, workerProcess);
        }
    }

    addWorker() { return this.#spawnWorker(); }

    removeWorker(workerProcess) {
        if (!this.#workerProcesses.has(workerProcess)) return;
        this.#reassignSubscriptions(workerProcess);
        workerProcess.kill();
        this.#removeWorker(workerProcess);
    }

    #spawnWorker() {
        const env = { ...process.env, DB_PARAMS: JSON.stringify(this.#dbParams) };
        const workerProcess = Client.spawn({ env });
        this.#workerProcesses.add(workerProcess);
        this.#workerLoadStats.set(workerProcess, 0);
        workerProcess.queueLength = 0;
        // Create bindings
        workerProcess.on('message', (msg) => {
            if (!msg || !msg.type) return;
            if (msg.type === 'patch' || msg.type === 'snapshot') {
                const cbs = this.callbacks.get(msg.table);
                for (const cb of cbs || []) {
                    cb(msg.patch || msg.snapshot);
                }
            } else if (msg.type === 'queueLength') {
                workerProcess.queueLength = msg.length;
            }
        });
        workerProcess.on('exit', (code, signal) => {
            this.emit('error', new Error(`Worker process exited (code=${code}, signal=${signal}), respawning...`));
            this.#reassignSubscriptions(workerProcess);
            this.#spawnWorker();
            this.#removeWorker(workerProcess);
        });
        return workerProcess;
    }

    #leastLoadedWorker() {
        let minWorker;
        for (const w of this.#workerProcesses) {
            if (!minWorker || this.#workerLoadStats.get(w) < this.#workerLoadStats.get(minWorker)) {
                minWorker = w;
            }
        }
        return minWorker;
    }

    #assignWorker(table) {
        const workerProcess = this.#leastLoadedWorker();
        this.subscriptions.set(table, workerProcess);
        this.#workerLoadStats.set(workerProcess, this.#workerLoadStats.get(workerProcess) + 1);
        workerProcess.send({ type: 'subscribe', table, batchInterval: this.#batchInterval });
        return workerProcess;
    }

    #reassignSubscriptions(crashedWorker) {
        for (const [table, workerProcess] of this.subscriptions.entries()) {
            if (workerProcess === crashedWorker) {
                this.subscriptions.delete(table);
                const newWorker = this.#assignWorker(table);
                console.log(`Reassigned table ${table} from crashed workerProcess`);
            }
        }
    }

    #removeWorker(workerProcess) {
        this.#workerProcesses.delete(workerProcess);
        this.#workerLoadStats.delete(workerProcess);
    }

    #unsubscribeTableFromWorker(table, workerProcess) {
        workerProcess.send({ type: 'unsubscribe', table });
        this.subscriptions.delete(table);
        this.callbacks.delete(table);
        this.#workerLoadStats.set(workerProcess, this.#workerLoadStats.get(workerProcess) - 1);
    }

    #autoScale() {
        const avgQueue = this.#avgWorkerQueue();
        if (avgQueue > this.#maxLoadPerWorker) this.addWorker();
        else if (avgQueue < this.#maxLoadPerWorker / 3 && this.#workerProcesses.size > 1) {
            const workerProcess = this.#leastLoadedWorker();
            this.removeWorker(workerProcess);
        }
    }

    #avgWorkerQueue() {
        let total = 0;
        for (const w of this.#workerProcesses) total += w.queueLength || 0;
        return total / this.#workerProcesses.size;
    }

    #rebalanceSubscriptions() {
        for (const workerProcess of this.#workerProcesses) {
            if (this.#workerLoadStats.get(workerProcess) > this.#maxLoadPerWorker) {
                const tablesToMove = this.#pickTablesToMove(workerProcess);
                for (const table of tablesToMove) {
                    const targetWorker = this.#leastLoadedWorker();
                    workerProcess.send({ type: 'unsubscribe', table });
                    targetWorker.send({ type: 'subscribe', table, batchInterval: this.#batchInterval });
                    this.subscriptions.set(table, targetWorker);
                    this.#workerLoadStats.set(workerProcess, this.#workerLoadStats.get(workerProcess) - 1);
                    this.#workerLoadStats.set(targetWorker, this.#workerLoadStats.get(targetWorker) + 1);
                }
            }
        }
    }

    #pickTablesToMove(workerProcess) {
        const tables = [...this.subscriptions.entries()]
            .filter(([table, w]) => w === workerProcess)
            .map(([table]) => table);
        return tables.slice(0, Math.ceil(tables.length / 2));
    }

    terminateAll() {
        for (const w of this.#workerProcesses) w.kill();
        this.#workerProcesses.clear();
    }
}
