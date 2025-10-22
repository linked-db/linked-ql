import { NamespaceSchema } from './ddl/namespace/NamespaceSchema.js';
import { matchRelationSelector, normalizeRelationSelectorArg } from '../db/abstracts/util.js';

export class SchemaInference {

    #searchPath = ['public'];
    get searchPath() { return this.#searchPath; }

    #driver;
    #queryHistory = new Map;

    #catalog;
    get catalog() { return this.#catalog; }

    #options;
    get options() { return this.#options; }

    constructor({ driver, catalog = [] } = {}, options = {}) {
        this.#driver = driver;
        this.#catalog = new Set(catalog);
        this.#options = options;
    }

    async provide(selector) {
        const currentEntries = [...this.#queryHistory.entries()];
        const diffedSelectors = {};
        let intersectionFound = false;
        const pendingFulfilments = [];
        const newRecords = [];
        const match = (a, b) => {
            // Exact match?
            if (b.includes(a)) return true;
            // If incoming is a pattern... no matching
            if (/^!|^%|%$|^\*$/.test(a)) return false;
            // If a IN b
            return matchRelationSelector(a, b);
        };
        const order = (x, a, b) => {
            // Exact match should come first
            if (a[0] === x) return -1;
            if (b[0] === x) return 1;
            // Wildcard should come last
            if (a[0] === '*') return 1;
            if (b[0] === '*') return -1;
            return 0;
        };
        const admit = (namespaceName, tables) => {
            diffedSelectors[namespaceName] = tables;
            // Create or update a record for the selector
            const newTableList = [].concat(this.#queryHistory.get(namespaceName)?.tables || []).concat(tables);
            const newRecord = { namespace: namespaceName, tables: newTableList, fulfilment: null };
            this.#queryHistory.set(namespaceName, newRecord);
            newRecords.push(newRecord);
        };
        const diff = (namespaceName, tables) => {
            if (!currentEntries.length) return admit(namespaceName, tables);
            const currentEntries_sorted = currentEntries.sort((a, b) => order(namespaceName, a, b));
            for (const [namespaceNameSpec, existingRecord] of currentEntries_sorted) {
                // See if intersects with namespaceNameSpec & currentEntries_sorted
                if (match(namespaceName, [namespaceNameSpec])) {
                    const diffedTables = tables.filter((t) => !match(t, existingRecord.tables));
                    // If intersects with existingRecord's tables... wait for fulfilment
                    if (diffedTables.length < tables.length) {
                        intersectionFound = true;
                        if (existingRecord.fulfilment) {
                            pendingFulfilments.push(existingRecord.fulfilment);
                        }
                    }
                    if (diffedTables.length) {
                        admit(namespaceName, diffedTables);
                    }
                } else {
                    admit(namespaceName, tables);
                }
            }
        };
        // -----------------------------
        // Pre-process selector
        selector = normalizeRelationSelectorArg(selector);
        for (const [namespaceName, objectNames] of Object.entries(selector)) {
            diff(namespaceName, objectNames);
        }
        // -----------------------------
        // Build final fulfilment list
        let currentFulfilment,
            totalFulfilment = Promise.resolve(0);
        if (Object.keys(diffedSelectors).length) {
            currentFulfilment = this.#driver?.showCreate(diffedSelectors, true);
            pendingFulfilments.push(currentFulfilment);
            for (const newRecord of newRecords) {
                newRecord.fulfilment = currentFulfilment;
            }
            currentFulfilment.finally(() => {
                for (const newRecord of newRecords) {
                    newRecord.fulfilment = null;
                }
            });
            totalFulfilment = Promise.all(pendingFulfilments).then(() => intersectionFound ? 2 : 1);
        } else if (pendingFulfilments.length) {
            totalFulfilment = Promise.all(pendingFulfilments).then(() => -1);
        }
        // -----------------------------
        // Process request if any
        const resultSchemas = await currentFulfilment;
        if (resultSchemas?.length) {
            for (const resultSchema of resultSchemas) {
                // Instantiate...
                const newNamespaceSchema = NamespaceSchema.fromJSON(resultSchema, { dialect: this.#driver.dialect });
                for (const existingNamespaceSchema of this.#catalog) {
                    if (existingNamespaceSchema.name().identifiesAs(newNamespaceSchema.name())) {
                        // Inherit existing tables from existingNamespaceSchema
                        for (const existingTableSchema of existingNamespaceSchema.tables()) {
                            if (!newNamespaceSchema.has(existingTableSchema.name())) {
                                newNamespaceSchema.add(existingTableSchema.clone());
                            }
                        }
                        // Delete existingNamespaceSchema
                        this.#catalog.delete(existingNamespaceSchema);
                    }
                }
                // Register newNamespaceSchema
                this.#catalog.add(newNamespaceSchema);
            }
        }
        return await totalFulfilment;
    }
}