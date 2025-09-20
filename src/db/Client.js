import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AbstractClient } from './abstracts/AbstractClient.js';
import { AbstractDriver } from './abstracts/AbstractDriver.js';
import { RealtimeClient } from './realtime/RealtimeClient.js';
import { ProxyDriver } from './driver/ProxyDriver.js';
import { normalizeQueryArgs } from './abstracts/util.js';

export class Client extends AbstractClient {

    #driver;
    #realtime;

    constructor(driver = { dialect: 'postgres' }) {
        super();
        if (!(driver instanceof AbstractDriver)) {
            throw new TypeError('driver must be an instance of AbstractDriver');
        }
        this.#driver = driver;
        this.#realtime = new RealtimeClient(this.#driver);
    }

    async query(...args) {
        const [query, options] = normalizeQueryArgs(...args);
        if (options.live) {
            return this.#realtime.query(query, options);
        }
        return this.#driver.query(query, options);
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

    const driver = new ProxyDriver(DB_PARAMS);
    const instance = new Client(driver);

    process.on('message', () => {

    });
}