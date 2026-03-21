import { SimpleEmitter } from './SimpleEmitter.js';

export class LinkedQLClient extends SimpleEmitter {
    
    #dialect;
    #options;

    #capabilityOverride;
    #workingCapability;

    get dialect() { return this.#dialect; }
    get options() { return this.#options; }

    constructor({ dialect, capability = {}, ...options } = {}) {
        super();
        
        this.#dialect = dialect;
        this.#options = options;

        this.#capabilityOverride = capability;
        this.#workingCapability = capability;
    }

    async connect() { }

    async disconnect() { }

    async setCapability(capMap) {
        const _capMap = Object.fromEntries(
            Object.entries(capMap).filter(([k, v]) => {
                return !v || this.#capabilityOverride[k] !== false;
            })
        );

        // Publish...
        this.#workingCapability = {
            ...this.#workingCapability,
            ..._capMap,
        };

        // realtime?
        if (_capMap.realtime === false) {
            await this._teardownRealtime?.();
        } else if (_capMap.realtime) {
            await this._setupRealtime?.();
        }

        return _capMap;
    }

    // ------------

    #lifetimeSchemaInference;

    resolveGetResolver(cb) {
        if (this.#options.nonDDLMode) {
            // We've been promised no DDL operations will
            // happen while we're running
            if (!this.#lifetimeSchemaInference)
                this.#lifetimeSchemaInference = cb();
            return this.#lifetimeSchemaInference;
        }
        return cb();
    }
}