import { LinkedQlWal } from '../../../proc/timeline/LinkedQlWal.js';

export class EdgeWal extends LinkedQlWal {

    #edgeClient;
    #walSub;

    constructor({ edgeClient, ...options }) {
        super({
            ...options,
            linkedQlClient: edgeClient,
            lifecycleHook: async (status) => {
                if (status) {
                    this.#walSub = await this.#edgeClient._subscribe(async (commit) => this.dispatch(commit));
                } else {
                    await this.#walSub?.abort();
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

        const walSub = await super.subscribe(...args);
        this.#walSub.on('error', (e) => {
            if (!walSub.aborted) walSub.emit('error', e);
        });
        
        return walSub;
    }

    async applyDownstreamCommit(commit, options = {}) {
        const procName = 'wal:handle_downstream_commit';
        return await this.#edgeClient._exec(procName, { commit, options });
    }
}
