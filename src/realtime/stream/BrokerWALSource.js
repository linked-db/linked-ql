import net from 'node:net';

export class BrokerWALSource {
    constructor({ host = '127.0.0.1', port = 8123 } = {}) {
        this.host = host;
        this.port = port;
        this.subscribers = new Map; // table -> Set(callback)
        this.socket = null;
        this._buffer = '';
    }

    connect() {
        this.socket = net.connect({ host: this.host, port: this.port }, () => {
            console.log('[BrokerWALSource] connected to broker', `${this.host}:${this.port}`);
        });

        this.socket.on('data', (chunk) => {

            this._buffer += chunk.toString();
            const lines = this._buffer.split('\n');
            this._buffer = lines.pop(); // incomplete

            for (const line of lines) {
                if (!line) continue;
                try {
                    const msg = JSON.parse(line);
                    const subs = this.subscribers.get(msg.table) || [];
                    for (const cb of subs) {
                        cb(msg);
                    }
                } catch (err) {
                    console.error('[BrokerWALSource] invalid msg', err);
                }
            }
        });

        this.socket.on('error', (err) => console.error('[BrokerWALSource] socket err', err));
        this.socket.on('close', () => console.warn('[BrokerWALSource] socket closed'));
    }

    subscribe(table, callback) {
        if (!this.subscribers.has(table)) {
            this.subscribers.set(table, new Set());
        }
        this.subscribers.get(table).add(callback);
        if (this.socket) {
            this.socket.write(JSON.stringify({ type: 'subscribe', table }) + '\n');
        }
    }

    unsubscribe(table, callback) {
        const s = this.subscribers.get(table);
        if (s) {
            if (callback) s.delete(callback);
            else this.subscribers.delete(table);
        }
        if (this.socket) {
            this.socket.write(JSON.stringify({ type: 'unsubscribe', table }) + '\n');
        }
    }

    getQueueLength() { return 0; }
}
