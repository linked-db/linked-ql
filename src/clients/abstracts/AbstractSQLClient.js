export class AbstractSQLClient {

    #capabilityOverride;
    #workingCapability;
    #options;

    get options() { return this.#options; }

    constructor({ capability = {}, ...options } = {}) {
        this.#capabilityOverride = capability;
        this.#workingCapability = capability;
        this.#options = options;
    }

    async connect() {}

    async disconnect() {}

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

        return _capMap;
    }
}