import { ClassicClient } from '../ClassicClient.js';

export class MySQLClient extends ClassicClient {

    #connectionParams;
    #enableLive;
    #walSlot;

    #driver;
    #walClient;

    get dialect() { return 'mysql'; }
    get driver() { return this.#driver; }
    get enableLive() { return this.#enableLive; }

    get walSlot() { return this.#walSlot; }

    constructor({
        enableLive = false,
        walSlot = 'linkedql_default_slot',
        ...connectionParams
    } = {}) {
        super();
        this.#enableLive = enableLive;

        this.#walSlot = walSlot;
    }

    // ---------Lifecycle

    async connect() {
        throw new Error('Method not implemented.');
    }

    async disconnect() {
        throw new Error('Method not implemented.');
    }
}
