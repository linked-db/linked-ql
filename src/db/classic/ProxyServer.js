import net from 'node:net';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { PGClient } from './PGClient.js';

export class ProxyServer extends SimpleEmitter {

    #env;
    #dbClient;
    #subscriptions = new Map;

    constructor(env) {
        if (!(env.DB_PARAMS && typeof env.DB_PARAMS === 'object')) {
            throw new Error('[broker] "env.DB_PARAMS" is a required parameter and must be a string.');
        }
        this.#env = env;
        this.#dbClient = new PGClient(this.#env.DB_PARAMS, this.#env.WAL_SLOT);
    }

    async start() {
        // TCP server for clients to connect and subscribe
        net.createServer((clientSocket) => {
            clientSocket.setEncoding('utf8');
            // Listen to messages
            clientSocket.on('data', async (data) => {
                const lines = data.toString().split('\n').filter(Boolean);
                for (const line of lines) {
                    let msg;
                    try { msg = JSON.parse(line); } catch (err) {
                        this.emit('error', `Incoming message error: ${err.message}`);
                    }
                    await this.handle(clientSocket, msg);
                }
            });
            // Handle lifecycle events
            clientSocket.on('error', (err) => {
                this.handleUnsubscribe(clientSocket);
                this.emit('error', `Worker error ${err}`);
            });
            clientSocket.on('close', () => {
                this.handleUnsubscribe(clientSocket);
            });
        }).listen(this.#env.PORT);
    }

    _send(clientSocket, data, autoClose = false) {
        try {
            clientSocket.write(JSON.stringify(data) + '\n');
            if (autoClose) clientSocket.close();
        } catch (e) {
            this.emit('error', `Outgoing message error; ${e.message}`);
        }
    }

    async handle(clientSocket, msg) {
        if (msg.type === 'query') {
            await this.handleQuery(clientSocket, msg);
        } else if (msg.type === 'subscribe') {
            this.handleSubscribe(clientSocket, msg);
        } else if (msg.type === 'unsubscribe') {
            this.handleUnsubscribe(clientSocket, msg);
        }
    }

    async handleQuery(clientSocket, msg) {
        if (!Array.isArray(msg.args)) {
            this.emit('error', `Incoming message invalid: ${JSON.stringify(msg)}`);
        }
        try {
            const result = await this.#dbClient.query(...msg.args);
            this._send(clientSocket, { type: 'result', data: result });
        } catch (e) {
            this._send(clientSocket, { type: 'error', message: e.message }, true);
        }
    }

    handleSubscribe(clientSocket, msg) {
        if (!this.#subscriptions.has(clientSocket)) {
            this.#subscriptions.set(clientSocket, new Map);
        }
        const table = msg.table || '*';
        if (!this.#subscriptions.get(clientSocket).has(table)) {
            this.#subscriptions.get(clientSocket).set(table, this.#dbClient.subscribe(table, (events) => {
                this._send(clientSocket, { type: 'events', data: events });
            }));
        }
    }

    handleUnsubscribe(clientSocket, msg = null) {
        if (!msg && this.#subscriptions.get(clientSocket)) {
            return [...this.#subscriptions.get(clientSocket).keys()].forEach((k) => {
                this.handleUnsubscribe(clientSocket, { table: k });
            })
        }
        const table = msg.table || '*';
        for (const abortLine of this.#subscriptions.get(clientSocket)?.get(table) || []) {
            abortLine();
        }
        this.#subscriptions.get(clientSocket)?.delete(table);
        if (!this.#subscriptions.get(clientSocket)?.size) {
            this.#subscriptions.delete(clientSocket);
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

    // ------------

    static spawn(params) {
        const __file__ = fileURLToPath(import.meta.url);
        const process = fork(__file__, ['--linked-ql-proxy-server-autorun'], params);
        return process;
    }
}

if (process.send && process.argv.includes('--linked-ql-proxy-server-autorun')) {
    const DB_PARAMS = process.env.DB_PARAMS;

    const proxyServer = new ProxyServer(DB_PARAMS);

    process.on('message', () => {

    });
}