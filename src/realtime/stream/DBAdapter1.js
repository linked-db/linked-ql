import { LogicalReplicationService, Wal2JsonPlugin, PgoutputPlugin } from 'pg-logical-replication';
import { SimpleEmitter } from '../engine/SimpleEmitter.js';
import pg from 'pg';

export class DBAdapter1 extends SimpleEmitter {

    #walClient;
    #walSlot;
    #connectionParams;
    #subscribers = new Map;

    #localDB = null;
    get localDB() { return this.#localDB; }

    #remoteDB = null;
    get remoteDB() { return this.#remoteDB; }

    constructor({ mode = 1, connection: connectionParams, slot: walSlot } = {}) {
        super();
        this.#connectionParams = connectionParams;
        this.#walSlot = walSlot;
        if (mode === 2) {
            this.#localDB = null;
        }
        if (this.#connectionParams) {
            this.#remoteDB = new pg.Client(this.#connectionParams);
        }
    }

    async connect() {
        if (!this.#connectionParams) return;
        // Setup PG client
        await this.#remoteDB.connect();
        // Setup WAL client
        this.#walClient = new LogicalReplicationService({
            connection: this.#connectionParams,
            slotName: this.#walSlot,
            plugin: new Wal2JsonPlugin({}),
        });
        this.#walClient.on('data', (lsn, log) => {
            if (!log || !log.change) return;
            for (const change of log.change) {
                this._sync(change);
            }
        });
        this.#walClient.on('error', (err) => {
            this.emit('error', `WAL Client error: ${err}`);
        });
        await this.#walClient.start();
    }

    async query(...args) {
        return this.#localDB
            ? await this.#localDB.query(...args)
            : await this.#remoteDB.query(...args);
    }

    subscribe(table, callback) {
        if (!this.#subscribers.has(table)) {
            this.#subscribers.set(table, new Set());
        }
        this.#subscribers.get(table).add(callback);
        return () => {
            this.#subscribers.get(table)?.delete(callback);
            if (!this.#subscribers.get(table)?.size) {
                this.#subscribers.delete(table);
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
