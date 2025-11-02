import { SimpleEmitter } from '../entry/abstracts/SimpleEmitter.js';
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

    async namespaceNames(selector = {}) {
        await this.#init;
        let list = [...this.#catalog.keys()];

        if ('mirrored' in selector) {
            list = list.filter((ns) => {
                const nsObj = this.#catalog.get(ns);
                if (/*'mirrored' in selector
                    && */Boolean(selector.mirrored) !== Boolean(nsObj.mirrored)) return false;
                return true;
            });
        }

        return list;
    }

    async createNamespace(namespaceName, { ifNotExists = false, ...namespaceOptions } = {}) {
        await this.#init;

        if (this.#catalog.has(namespaceName)) {
            if (ifNotExists) return this.#catalog.get(namespaceName);
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

        const namespaceObject = this.#catalog.get(namespaceName);
        if (!namespaceObject) throw new Error(`Schema/namespace ${namespaceName} does not exist`);
        return namespaceObject;
    }

    async showMirrors(selector = {}) {
        const mirroredNamespaces = await this.namespaceNames({ mirrored: true });
        const mirroredNamespacesEntries = mirroredNamespaces.map(async (namespaceName) => {

            const namespaceObject = await this.getNamespace(namespaceName);
            const tables = await namespaceObject.tableNames(selector);

            const tablesEntries = tables.map(async (tableName) => {
                const tableStorage = await namespaceObject.getTable(tableName);

                return [tableName, { materialized: tableStorage.materialized, querySpec: tableStorage.querySpec }];
            });

            return [namespaceName, { type: namespaceObject.type, origin: namespaceObject.origin, tables: new Map(await Promise.all(tablesEntries)) }];
        });

        return new Map(await Promise.all(mirroredNamespacesEntries));
    }
}
