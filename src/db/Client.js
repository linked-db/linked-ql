import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AbstractClient } from './abstracts/AbstractClient.js';
import { AbstractDBAdapter } from './abstracts/AbstractDBAdapter.js';
import { RealtimeClient } from './realtime/RealtimeClient.js';
import { ProxyClient } from './classic/ProxyClient.js';

export class Client extends AbstractClient {

    #dbAdapter;
    #realtime;

    constructor(dbAdapter = { dialect: 'postgres' }) {
        super();
        if (!(dbAdapter instanceof AbstractDBAdapter)) {
            throw new TypeError('dbAdapter must be an instance of AbstractDBAdapter');
        }
        this.#dbAdapter = dbAdapter;
        this.#realtime = new RealtimeClient(this.#dbAdapter);
    }

    async query(...args) {
        const [query, options] = this._resolveQueryArgs(...args);
        if (options.live) {
            return this.#realtime.query(query, options);
        }
        return this.#dbAdapter.query(query, options);
    }

    // ------------

    static spawn(params) {
        const __file__ = fileURLToPath(import.meta.url);
        const worker = fork(__file__, ['--linked-ql-client-autorun'], params);
        return worker;
    }
}

if (process.send && process.argv.includes('--linked-ql-client-autorun')) {
    const DB_PARAMS = process.env.DB_PARAMS;

    const dbAdapter = new ProxyClient(DB_PARAMS);
    const instance = new Client(dbAdapter);

    process.on('message', () => {

    });
}