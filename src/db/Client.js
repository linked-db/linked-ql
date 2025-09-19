import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AbstractClient } from './abstracts/AbstractClient.js';
import { AbstractDriver } from './abstracts/AbstractDriver.js';
import { RealtimeClient } from './realtime/RealtimeClient.js';
import { ProxyDriver } from './driver/ProxyDriver.js';
import { normalizeQueryArgs } from './abstracts/util.js';

export class Client extends AbstractClient {

    #dbAdapter;
    #realtime;

    constructor(dbAdapter = { dialect: 'postgres' }) {
        super();
        if (!(dbAdapter instanceof AbstractDriver)) {
            throw new TypeError('dbAdapter must be an instance of AbstractDriver');
        }
        this.#dbAdapter = dbAdapter;
        this.#realtime = new RealtimeClient(this.#dbAdapter);
    }

    async query(...args) {
        const [query, options] = normalizeQueryArgs(...args);
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

    const dbAdapter = new ProxyDriver(DB_PARAMS);
    const instance = new Client(dbAdapter);

    process.on('message', () => {

    });
}