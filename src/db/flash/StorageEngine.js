import { SimpleEmitter } from '../abstracts/SimpleEmitter.js';
import { ConflictError } from './ConflictError.js';
import { StorageNamespace } from './StorageNamespace.js';

export class StorageEngine extends SimpleEmitter {

    #defaultNamespace;
    #options;

    #catalog = new Map;
    #init;

    get defaultNamespace() { return this.#defaultNamespace; }
    get options() { return this.#options; }

    constructor({
        defaultNamespace = 'public',
        ...options
    } = {}) {
        super();
        this.#defaultNamespace = defaultNamespace;
        this.#options = options;

        if (defaultNamespace) {
            this.#init = this.createNamespace(defaultNamespace, { ifNotExists: true });
        }
    }

    async startTransaction(txIdPrefix = '~tx') {
        const events = new Map;
        const txId = `${txIdPrefix}:${(0 | Math.random() * 9e6).toString(36)}`;

        return {
            txId,
            emit: (eventName, event) => {
                if (!events.has(eventName)) events.set(eventName, []);
                events.get(eventName).push({ ...event, txId });
            },
            done: async () => {
                for (const [name, _events] of events.entries()) {
                    this.emit(name, _events);
                }
                events.clear();
            }
        };
    }

    async namespaceNames() {
        await this.#init;
        return [...(this.#catalog.keys())];
    }

    async createNamespace(namespaceName, { ifNotExists = false, ...namespaceOptions } = {}) {
        await this.#init;

        if (this.#catalog.has(namespaceName)) {
            if (ifNotExists) return false;
            throw new ConflictError(`Schema/namespace ${namespaceName} already exists`);
        }

        const namespaceObject = new StorageNamespace(namespaceName, this, namespaceOptions);
        this.#catalog.set(namespaceName, namespaceObject);
        return namespaceObject;
    }

    async dropNamespace(namespaceName, { ifExists = false, cascade = false } = {}) {
        await this.#init;

        const namespaceObject = this.#catalog.get(namespaceName);
        if (!namespaceObject) {
            if (ifExists) return null;
            throw new Error(`Schema/namespace ${namespaceName} does not exist`);
        }

        if (namespaceObject.size && !cascade) {
            throw new Error(`Schema/namespace ${namespaceName} is not empty.`);
        }
        await namespaceObject._destroy();

        this.#catalog.delete(namespaceName);
        return namespaceObject;
    }

    async getNamespace(namespaceName) {
        await this.#init;

        const namespaceObject = await this.#catalog.get(namespaceName);
        if (!namespaceObject) throw new Error(`Schema/namespace ${namespaceName} does not exist`);
        return namespaceObject;
    }
}
