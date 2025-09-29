import { AbstractClient } from './abstracts/AbstractClient.js';
import { AbstractDriver } from './abstracts/AbstractDriver.js';
import { RealtimeDriver } from './realtime/RealtimeDriver.js';
import { normalizeQueryArgs } from './abstracts/util.js';

export class Client extends AbstractClient {

    #dbDriver;
    #realtimeDriver;

    constructor(dbDriver) {
        super();
        if (!(dbDriver instanceof AbstractDriver)) {
            throw new TypeError('driver must be an instance of AbstractDriver');
        }
        if (dbDriver instanceof RealtimeDriver) {
            throw new Error(`driver cannot be an instance of RealtimeDriver`);
        }
        this.#dbDriver = dbDriver;
        this.#realtimeDriver = new RealtimeDriver(this.#dbDriver);
    }

    async query(...args) {
        let [query, options] = normalizeQueryArgs(...args);
        // Realtime query?
        if (options.live) {
            return await this.#realtimeDriver.query(query, options);
        }
        return await this.#dbDriver.query(query, options);
    }
}