import { LogicalReplicationService, Wal2JsonPlugin } from 'pg-logical-replication';

export class InlineWALSource {
    constructor({ connection, slot } = {}) {
        this.connection = connection;
        this.slot = slot;
        this.subscribers = new Map; // table -> Set(callback)
        this.client = null;
    }

    async start() {
        this.client = new LogicalReplicationService({
            connection: this.connection,
            slotName: this.slot,
            plugin: new Wal2JsonPlugin({}),
        });

        this.client.on('data', (lsn, log) => {
            if (!log || !log.change) return;
            for (const change of log.change) {
                const table = change.table;
                const subs = this.subscribers.get(table) || [];
                for (const cb of subs) {
                    cb({ type: 'patch', table, data: change });
                }
            }
        });

        this.client.on('error', (err) => {
            console.error('InlineWALSource replication error:', err);
        });

        await this.client.start();
        console.log('[InlineWALSource] started replication on slot', this.slot);
    }

    subscribe(table, callback) {
        if (!this.subscribers.has(table)) {
            this.subscribers.set(table, new Set());
        }
        this.subscribers.get(table).add(callback);
    }

    unsubscribe(table, callback) {
        this.subscribers.get(table)?.delete(callback);
        if (!this.subscribers.get(table)?.size) {
            this.subscribers.delete(table);
        }
    }

    getQueueLength() { return 0; }
}
