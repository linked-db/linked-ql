import { SyncEngine as BaseSyncEngine } from '../../proc/sync/SyncEngine.js';

export class SyncEngine extends BaseSyncEngine {

    #client;

    constructor({ client, ...options }) {
        super(options);
        this.#client = client;
    }

    async subscribe(...args) {
        const options = typeof args[args.length - 1] === 'object' && args[args.length - 1]
            ? args[args.length - 1]
            : {};

        if (options.preferRemote) {
            return await this.#client._subscribe(...args);
        }

        return await super.subscribe(...args);
    }
}