import net from 'node:net';
import { SimpleEmitter } from '../engine/SimpleEmitter.js';

export class DBAdapter2 extends SimpleEmitter {

    #walSocket;
    #brokerHost;
    #brokerPort;
    #subscribers = new Map;
    #_buffer = '';

    #localDB = null;
    get localDB() { return this.#localDB; }

    #remoteDB = null;
    get remoteDB() { return this.#remoteDB; }

    constructor({ mode = 1, host: brokerHost = '127.0.0.1', port: brokerPort = 8123 } = {}) {
        super();
        this.#brokerHost = brokerHost;
        this.#brokerPort = brokerPort;
        if (mode === 2) {
            this.#localDB = null;
        }
        const $this = this;
        this.#remoteDB = {
            async query(...args) {
                if (!$this.#walSocket) throw new Error(`No connection to remote host.`);
                const result = await $this.#walSocket.write(JSON.stringify({ type: 'query', args }) + '\n');
                if (result.type === 'error') throw new Error(result.message);
                return result.data;
            },
        };
    }

    async connect() {
        this.#walSocket = net.connect({ host: this.#brokerHost, port: this.#brokerPort });
        this.#walSocket.on('data', (chunk) => {
            this.#_buffer += chunk.toString();
            const lines = this.#_buffer.split('\n');
            this.#_buffer = lines.pop(); // incomplete
            for (const line of lines) {
                if (!line) continue;
                let change;
                try { change = JSON.parse(line); } catch (err) {
                    this.emit('error', `Incoming message error: ${err.message}`);
                }
                if (change.type === 'batch') {
                    for (const event of change.entries) {
                        this._sync(event);
                    }
                }
            }
        });
        this.#walSocket.on('error', (err) => this.emit('error', `Socket error: ${err}`));
        this.#walSocket.on('close', () => this.emit('error', `Socket closed`));
    }

    async query(...args) {
        return this.#localDB
            ? await this.#localDB.query(...args)
            : await this.#remoteDB.query(...args);
    }

    subscribe(table, callback) {
        if (!this.#subscribers.has(table)) {
            this.#subscribers.set(table, new Set());
            if (this.#walSocket) {
                this.#walSocket.write(JSON.stringify({ type: 'subscribe', table }) + '\n');
            }
        }
        this.#subscribers.get(table).add(callback);
        return () => {
            this.#subscribers.get(table)?.delete(callback);
            if (!this.#subscribers.get(table)?.size && this.#walSocket) {
                this.#walSocket.write(JSON.stringify({ type: 'unsubscribe', table }) + '\n');
            }
        };
    }

    _sync(event) {
        this.#localDB?.sync(event);
        const subscribers = this.#subscribers.get(event.table) || [];
        for (const cb of subscribers) {
            cb(event);
        }
    }

    getQueueLength() { return 0; }
}
