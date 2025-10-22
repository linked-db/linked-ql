import '../../lang/index.js';
import { SimpleEmitter } from './SimpleEmitter.js';
import { normalizeRelationSelectorArg } from './util.js';
import { SchemaInference } from '../../lang/SchemaInference.js';

export class AbstractClient extends SimpleEmitter {

    #subscribers = new Map;

    #schemaInference;

    #capabilityOverride;
    #workingCapability;

    get schemaInference() { return this.#schemaInference; }

    constructor({ capability = {} } = {}) {
        super();
        this.#capabilityOverride = capability;
        this.#workingCapability = capability;
        this.#schemaInference = new SchemaInference({ driver: this });
    }

    async connect() {
        await this._connect();
    }

    async disconnect() {
        await this.setCapability({ realtime: false });
        await this._disconnect();
    }

    // ---------

    async parse(querySpec, { alias = null, dynamicWhereMode = false, ...options } = {}) {
        throw new Error(`parse() is unimplemented`);
    }

    async resolve(query, options = {}) {
        throw new Error(`resolve() is unimplemented`);
    }

    async query(...args) {
        throw new Error(`resolve() is unimplemented`);
    }

    async cursor(...args) {
        throw new Error(`resolve() is unimplemented`);
    }

    async showCreate(selector, structured = false) {
        throw new Error(`resolve() is unimplemented`);
    }

    async subscribe(selector, callback) {
        await this.setCapability({ realtime: true });

        if (typeof selector === 'function') {
            callback = selector;
            selector = '*';
        }

        const flattenedSelectorSet = normalizeRelationSelectorArg(selector, true);
        this.#subscribers.set(callback, flattenedSelectorSet);

        return async () => {
            this.#subscribers.delete(callback);
            if (!this.#subscribers.size) {
                await this.setCapability({ realtime: false });
            }
        };
    }

    async setCapability(capMap) {
        const _capMap = Object.fromEntries(Object.entries(capMap).filter(([k, v]) => {
            return !v || this.#capabilityOverride[k] !== false;
        }));
        // realtime?
        if (_capMap.realtime === false) {
            await this._teardownRealtime();
        } else if (_capMap.realtime) {
            await this._setupRealtime();
        }
        // Publish...
        this.#workingCapability = {
            ...this.#workingCapability,
            ..._capMap,
        };
    }

    // ---------

    _fanout(events) {
        const eventsAndPatterns = [];
        const allPatterns = new Set;
        for (const event of events) {
            const patterns = [
                JSON.stringify([event.relation.namespace, event.relation.name]),
                JSON.stringify(['*', event.relation.name]),
                JSON.stringify([event.relation.namespace, '*']),
            ];
            eventsAndPatterns.push({ event, patterns });
            allPatterns.add(patterns[0]);
            allPatterns.add(patterns[1]);
            allPatterns.add(patterns[2]);
        }
        for (const [cb, flattenedSelectorSet] of this.#subscribers.entries()) {
            let _events = [];
            // Match and filter
            for (const pattern of flattenedSelectorSet) {
                if (pattern === '["*","*"]') {
                    _events = [...events];
                    break;
                } else if (allPatterns.has(pattern)) {
                    for (const { event, patterns } of eventsAndPatterns) {
                        if (patterns.includes(pattern)) {
                            _events.push(event);
                        }
                    }
                    break;
                }
            }
            if (!_events.length) continue;
            // Successful match
            cb(_events);
        }
    }
}