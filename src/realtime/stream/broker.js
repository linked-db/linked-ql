import net from 'node:net';
import { LogicalReplicationService, Wal2JsonPlugin } from 'pg-logical-replication';
import { SimpleEmitter } from '../engine/SimpleEmitter';
import pg from 'pg';

export class Broker extends SimpleEmitter {

    #env;
    #workers = new Set;
    #subscriptions = new Map;
    #bufferQueue = new Map;

    #dbClient;
    #walClient;

    constructor(env) {
        if (!(env.DB_PARAMS && typeof env.DB_PARAMS === 'object')) {
            throw new Error('[broker] "env.DB_PARAMS" is a required parameter and must be a string.');
        }
        this.#env = env;
    }

    async start() {
        // TCP server for workers to connect and subscribe
        net.createServer((workerSocket) => {
            this.#workers.add(workerSocket);
            workerSocket.setEncoding('utf8');
            // Listen to messages
            workerSocket.on('data', async (data) => {
                const lines = data.toString().split('\n').filter(Boolean);
                for (const line of lines) {
                    let msg;
                    try { msg = JSON.parse(line); } catch (err) {
                        this.emit('error', `Incoming message error: ${err.message}`);
                    }
                    await this.handle(workerSocket, msg);
                }
            });
            // Handle lifecycle events
            workerSocket.on('close', () => {
                this.#workers.delete(workerSocket);
                for (const subs of this.#subscriptions.values()) {
                    subs.delete(workerSocket);
                }
            });
            workerSocket.on('error', (err) => {
                this.emit('error', `Worker error ${err}`);
                this.#workers.delete(workerSocket);
                for (const subs of this.#subscriptions.values()) {
                    subs.delete(workerSocket);
                }
            });
        }).listen(this.#env.PORT);
        //---------------
        // DB client
        this.#dbClient = new pg.Client(this.#env.DB_PARAMS.connection);
        await this.#dbClient.connect();
        //---------------
        // WAL consumer using pg-logical-replication
        this.#walClient = new LogicalReplicationService({
            connection: this.#env.DB_PARAMS.connection,
            slotName: this.#env.DB_PARAMS.slot,
            plugin: new Wal2JsonPlugin({}),
        });
        this.#walClient.on('data', (lsn, log) => {
            if (!log || !log.change) return;
            for (const change of log.change) {
                const table = change.table;
                if (!this.#bufferQueue.has(table)) {
                    this.#bufferQueue.set(table, []);
                }
                this.#bufferQueue.get(table).push(change);
            }
        });
        await this.#walClient.start();
        this.#walClient.on('error', (err) => {
            this.emit('error', `WAL Client error: ${err}`);
        });
        //---------------
        // batched fan-out: flush queue to all subscribed workerSockets
        setInterval(() => {
            for (const [table, arr] of this.#bufferQueue.entries()) {
                if (!arr.length) continue;
                const data = { type: 'batch', entries: arr.splice(0) };
                const subs = [...(this.#subscriptions.get(table) || []), ...(this.#subscriptions.get('*') || [])];
                for (const workerSocket of subs) {
                    this._send(workerSocket, data);
                }
            }
        }, this.#env.FANOUT_INTERVAL);

    }

    async handle(workerSocket, msg) {
        if (msg.type === 'subscribe') {
            const table = msg.table || '*';
            if (!this.#subscriptions.has(table)) {
                this.#subscriptions.set(table, new Set());
            }
            this.#subscriptions.get(table).add(workerSocket);
        } else if (msg.type === 'unsubscribe') {
            const table = msg.table || '*';
            this.#subscriptions.get(table)?.delete(workerSocket);
            if (!this.#subscriptions.get(table)?.size) {
                this.#subscriptions.delete(table);
            }
        } else if (msg.type === 'query') {
            if (!Array.isArray(msg.args)) {
                this.emit('error', `Incoming message invalid: ${JSON.stringify(msg)}`);
            }
            try {
                const result = await this.#dbClient.query(...msg.args);
                this._send(workerSocket, { type: 'result', data: result });
            } catch (e) {
                this._send(workerSocket, { type: 'error', message: e.message }, true);
            }
        }
    }

    _send(workerSocket, data, autoClose = false) {
        try {
            workerSocket.write(JSON.stringify(data) + '\n');
            if (autoClose) workerSocket.close();
        } catch (e) {
            this.emit('error', `Outgoing message error; ${e.message}`);
        }
    }

    // ----------------------------

    static async autoRun() {
        const DB_PARAMS = JSON.parse(process.env.DB_PARAMS || 'null');
        const PORT = Number(process.env.PORT) || 8123;
        const FANOUT_INTERVAL = Number(process.env.FANOUT_INTERVAL) || 50;
        const env = {
            DB_PARAMS,
            PORT,
            FANOUT_INTERVAL,
        };
        try {
            const instance = new this(env);
            await instance.start();
            return instance;
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    }
}