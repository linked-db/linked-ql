import net from 'node:net';
import { AbstractDriver } from '../abstracts/AbstractDriver.js';
import { normalizeQueryArgs } from '../abstracts/util.js';

export class ProxyDriver extends AbstractDriver {

    #serverHost;
    #serverPort;

    #serverSocket;
    #subscribers = new Map;

    #_buffer = '';

    constructor({ host: serverHost = '127.0.0.1', port: serverPort = 8123 } = {}) {
        super();
        this.#serverHost = serverHost;
        this.#serverPort = serverPort;
    }

    async connect() {
        this.#serverSocket = net.connect({ host: this.#serverHost, port: this.#serverPort });
        this.#serverSocket.on('data', (chunk) => {
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
        this.#serverSocket.on('error', (err) => this.emit('error', `Socket error: ${err}`));
        this.#serverSocket.on('close', () => this.emit('error', `Socket closed`));
    }

    async query(...args) {
        const [query, options] = normalizeQueryArgs(...args);
        if (!this.#serverSocket) throw new Error(`No connection to remote host.`);
        const result = await this.#serverSocket.write(JSON.stringify({ type: 'query', query, options }) + '\n');
        if (result.type === 'error') throw new Error(result.message);
        return result.data;
    }

    subscribe(table, callback) {
        if (!this.#serverSocket) throw new Error(`No connection to remote host.`);
        if (!this.#subscribers.has(table)) {
            this.#subscribers.set(table, new Set);
            this.#serverSocket.write(JSON.stringify({ type: 'subscribe', table }) + '\n');
        }
        this.#subscribers.get(table).add(callback);
        return () => {
            this.#subscribers.get(table)?.delete(callback);
            if (!this.#subscribers.get(table)?.size && this.#serverSocket) {
                this.#serverSocket.write(JSON.stringify({ type: 'unsubscribe', table }) + '\n');
            }
        };
    }
}
