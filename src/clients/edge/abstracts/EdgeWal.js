import { LinkedQlWal } from '../../../proc/timeline/LinkedQlWal.js';

export class EdgeWal extends LinkedQlWal {

    #edgeClient;
    #realtimeGc;

    constructor({ edgeClient, ...options }) {
        super({
            ...options,
            linkedQlClient: edgeClient,
            lifecycleHook: async (status) => {
                if (status) {
                    this.#realtimeGc = await this.#edgeClient._subscribe(async (commit) => this.dispatch(commit));
                } else {
                    await this.#realtimeGc();
                }
            }
        });
        this.#edgeClient = edgeClient;
    }

    async subscribe(...args) {
        const options = args[args.findIndex((e) => typeof e === 'function') + 1] || {};

        if (options.preferRemote) {
            return await this.#edgeClient._subscribe(...args);
        }

        return await super.subscribe(...args);
    }

    async applyDownstreamCommit(commit, options = {}) {
        const procName = 'wal:handle_downstream_commit';
        return await this.#edgeClient._exec(procName, { commit, options });
    }
}
